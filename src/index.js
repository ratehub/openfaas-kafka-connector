const fs = require('fs');
const EventService  = require('./event.service');
const fetch = require('node-fetch');
const _ = require('lodash');
const cron = require("node-cron");
const dotenv = require('dotenv').config({path: __dirname + '/.env'});
require('console-stamp')(console);

const kafkaUri = process.env.KAFKA_CONNECTION;
const https = process.env.GATEWAY_SSL === "true";
const protocol = https ? "https" : "http";
let gatewayUser = process.env.GATEWAY_USER;
let gatewayPass = process.env.GATEWAY_PASS;
let ca = process.env.KAFKA_SSL_CA;
let key = process.env.KAFKA_SSL_KEY;
let cert = process.env.KAFKA_SSL_CERT;
let redisPassword = process.env.REDIS_PASS;

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
                port: process.env.REDIS_PORT, tls: process.env.REDIS_SSL === 'true' }
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
            console.log(`listening to topics: ${includeTopics}`);
            console.log(`excluding topics: ${excludeTopics}`);

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
                            console.log('Mapped new topic: ${topic}');
                            await subscribe(eventService, topic, []);
                            await eventService.enableSubscription(eventService.subscriptions.get(topic));
                        }
                        eventService.subscriptions.get(topic).functions = filter(allFunctions, topic);
                        //console.log(`Mapped topic: ${topic} to functions => {${eventService.subscriptions.get(topic).functions.map(f => f.name)}}` )
                    }
                }
                //console.log("****************************************************");
            });
        }
        else{
            console.error("No topics have been defined, please set env setting TOPICS with a comma delimited string or annotate functions with topic")
        }
    }
    catch(error){
       console.error(error);
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
            for(let t of topic.split(',')) {
                normalizedTopics.push(t);
            }
        }
    }
    return _.uniq(normalizedTopics);
}

async function subscribe(eventService, topic, functions){
    await eventService.subscribe(topic,
        `${topic}`, functions, async (payload, done) => {
            console.log(`executing: ${payload.data.metadata.function}`);
            let functionResponse = await fetch(`${faas}/function/${payload.data.metadata.function}`, {
                method: 'post',
                body: JSON.stringify(payload.data),
                headers: {'Content-Type': 'application/json'},
            });
            if(functionResponse.ok) {
                console.log(`Successfully invoked function: ${payload.data.metadata.function}`)
            }
            else{
                console.error(`Error invoking function: ${payload.data.metadata.function}`);
                console.error(JSON.stringify(`status: ${functionResponse.statusText}`));
                throw Error(JSON.stringify(await functionResponse.json()));
            }
            console.log(`finished: ${payload.data.metadata.function}`);
    });
}
