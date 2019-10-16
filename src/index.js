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

(async () =>
{
    try {
        let res =
            await fetch(`${faas}/system/functions`);
        let functions = await res.json();
        //console.log(functions);
        const eventService = new EventService(process.env.CONNECTOR_NAME,
            {url: kafkaUri, ssl: process.env.KAFKA_SSL === 'true',
                ca: ca,
                key: key,
                cert: cert
            },{ url: process.env.REDIS_CONNECTION, password: redisPassword,
                port: process.env.REDIS_PORT, tls: process.env.REDIS_SSL }
        );

        if(process.env.TOPICS) {
            let topics = process.env.TOPICS.split(",");
            for (let topic of topics) {
                let f = filter(functions, topic);
                eventService.subscribe(topic,
                    `${topic}`, f, async (payload, done) => {
                        let functionResponse = await fetch(`${faas}/function/${payload.data.metadata.function}`, {
                            method: 'post',
                            body: JSON.stringify(payload.data),
                            headers: {'Content-Type': 'application/json'},
                        });
                        if(functionResponse.ok) {
                            //console.log(await res.json());
                            console.log(`Successfully invoked function: ${payload.data.metadata.function}`)
                        }
                        else{
                            throw Error(JSON.stringify(await functionResponse.json()));
                        }
                });
            }

            await eventService.start();
            console.log(`listening to topics: ${process.env.TOPICS}`);

            cron.schedule("*/3 * * * * *", async function() {
                console.log("********** syncing topics and functions ************");
                let listFunctionsResponse =
                    await fetch(`${faas}/system/functions`);
                let allFunctions = await listFunctionsResponse.json();
                let listeningTopics = process.env.TOPICS.split(",");
                for(let topic of listeningTopics){
                    eventService.subscriptions.get(topic).functions = filter(allFunctions, topic);
                    console.log(`Mapped topic: ${topic} to functions => {${eventService.subscriptions.get(topic).functions.map(f => f.name)}}` )
                }
                console.log("****************************************************");
            });
        }
        else{
            console.error("No topics have been defined, please set env setting TOPICS with a comma delimited string")
        }
    }
    catch(error){
       console.error(error);
    }
})();

function filter(functions, topic){
  return _.filter(functions, o => o.annotations.topic ? o.annotations.topic.split(',').includes(topic) : false);
}
