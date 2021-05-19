const dotenv = require('dotenv').config({path: __dirname + '/.env'});
const newrelic = require('newrelic');
const fs = require('fs');
const EventService  = require('./event.service');
const fetch = require('node-fetch');
const _ = require('lodash');
const cron = require("node-cron");
let safeEval = require('safe-eval');
const { format, createLogger, transports } = require('winston');
const { combine, timestamp, simple, json } = format;


const perFunctionQueue = process.env.CREATE_JOB_QUEUE_PER_FUNCTION === "true";
const kafkaUri = process.env.KAFKA_CONNECTION;
const https = process.env.GATEWAY_SSL === "true";
const protocol = https ? "https" : "http";
let gatewayUser = process.env.GATEWAY_USER;
let gatewayPass = process.env.GATEWAY_PASS;
let ca = process.env.KAFKA_SSL_CA;
let key = process.env.KAFKA_SSL_KEY;
let cert = process.env.KAFKA_SSL_CERT;
let redisPassword = process.env.REDIS_PASS;
let concurrency = process.env.CONCURRENCY || 1;
concurrency = Number(concurrency);
let requestTimeout = process.env.TIMEOUT || 30000;
requestTimeout = Number(requestTimeout);

if (fs.existsSync('/var/secrets/basic-auth-user')){
    gatewayUser = fs.readFileSync('/var/secrets/basic-auth-user');
    gatewayPass = fs.readFileSync('/var/secrets/basic-auth-password');
}

if(fs.existsSync('/var/connector-secrets')){
    if(fs.existsSync('/var/connector-secrets/kafka-ssl-cert')) {
        ca = '/var/connector-secrets/kafka-ssl-ca';
        key = '/var/connector-secrets/kafka-ssl-key';
        cert = '/var/connector-secrets/kafka-ssl-cert';
    }

    if(fs.existsSync('/var/connector-secrets/redis-pass')){
        redisPassword = fs.readFileSync('/var/connector-secrets/redis-pass');
    }
}

const logger = createLogger({
    format: combine(timestamp(), simple(), json()),
    transports: [
        new transports.Console(),
    ],
});

const faas = `${protocol}://${gatewayUser}:${gatewayPass}@${process.env.GATEWAY_URI}`;
let topics = null;
let excludeTopics = [];
let includeTopics = [];

(async () =>
{
    try {
        let res =
            await fetch(`${faas}/system/functions`);
        let functions = await res.json();
        const eventService = new EventService(process.env.CONNECTOR_NAME,
            {url: kafkaUri, ssl: process.env.KAFKA_SSL === 'true',
                ca: ca,
                key: key,
                cert: cert
            },{ url: process.env.REDIS_CONNECTION, password: redisPassword,
                port: process.env.REDIS_PORT, tls: process.env.REDIS_SSL === 'true' },
            perFunctionQueue, logger
        );

        topics = process.env.TOPICS ? process.env.TOPICS.split(",") : await getTopics();

        if(process.env.EXCLUDE_TOPICS){
            excludeTopics = process.env.EXCLUDE_TOPICS.split(",");
        }

        if(topics != null && topics.length > 0) {
            for (let topic of topics) {
                if(!excludeTopics.includes(topic)) {
                    includeTopics.push(topic);
                    let f = filter(functions, topic);
                    await subscribe(eventService, topic, f);
                }
            }

            await eventService.start();
            logger.info(`listening to topics: ${includeTopics}`);
            logger.info(`excluding topics: ${excludeTopics}`);

            cron.schedule("*/3 * * * * *", async function() {
                if(!process.env.TOPICS){
                    topics = await getTopics();
                }

                let listFunctionsResponse =
                    await fetch(`${faas}/system/functions`);
                let allFunctions = await listFunctionsResponse.json();
                for(let topic of topics){
                    if(!excludeTopics.includes(topic)) {
                        let subscription = eventService.subscriptions.get(topic);
                        if (!subscription) {
                            logger.info(`Mapped new topic: ${topic}`);
                            await subscribe(eventService, topic, []);
                            await eventService.enableSubscription(eventService.subscriptions.get(topic));
                        }
                        eventService.subscriptions.get(topic).functions = filter(allFunctions, topic);
                    }
                }
            });
        }
        else{
            logger.error("No topics have been defined, please set env setting TOPICS with a comma delimited string or annotate functions with topic")
        }
    }
    catch(error){
        newrelic.noticeError(error);
        logger.error(error.message);
    }
})();

function filter(functions, topic){
    return _.filter(functions, o => o.annotations.topic ? o.annotations.topic.split(',').includes(topic) : false);
}

async function getTopics() {
    let res =
        await fetch(`${faas}/system/functions`);
    let functions = await res.json();
    let rawTopics =_.chain(functions).map(function(item) { return item.annotations.topic }).uniq().value();
    let normalizedTopics = [];
    for(let topic of rawTopics){
        if(topic) {
            for(let t of topic.replace(/\s/g, '').split(',')) {
                normalizedTopics.push(t);
            }
        }
    }
    return _.uniq(normalizedTopics);
}

async function subscribe(eventService, topic, functions){
    await eventService.subscribe(topic,
        `${topic}`, functions, concurrency, async (payload, done) => {
            let event = payload.data;
            let context = {
                event
            };
            try {
                //If filter has been specified, and it evaluates to true, or hasn't been specified
                //[Tech debt]: this is redundant, but good for any delayed jobs that maybe created before version 1.3.9,
                //or upgrading from a previous version of connector. Later versions will eval before creating a job,
                //this will be deprecated in version 2
                if (!payload.data.metadata.filter || safeEval(payload.data.metadata.filter, context)) {
                    let functionResponse = await fetch(`${faas}/function/${payload.data.metadata.function}`, {
                        method: 'post',
                        body: JSON.stringify(event),
                        headers: {'Content-Type': 'application/json'},
                        timeout: requestTimeout
                    });

                    if (functionResponse.ok) {
                        logger.info(`Successfully invoked function: ${payload.data.metadata.function}`)
                    } else {
                        let response = {
                            'function': payload.data.metadata.function,
                            'status': functionResponse.status,
                            'statusText': functionResponse.statusText,
                            'body': await functionResponse.text()
                        }
                        throw Error(JSON.stringify(response));
                    }
                }
                else if (payload.data.metadata.filter) {
                    logger.info(`Ignored filtered event for function: ${payload.data.metadata.function}`);
                }
            }catch (error) {
                logger.error(error.message);
                newrelic.noticeError(error, {function: payload.data.metadata.function, jobId: payload.id});
                throw error;
            }
    });
}
