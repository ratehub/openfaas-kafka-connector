const EventService  = require('./event.service');
const fetch = require('node-fetch');
const _ = require('lodash');
const cron = require("node-cron");
const dotenv = require('dotenv').config({path: __dirname + '/.env'});

const kafkaUri = process.env.KAFKA_CONNECTION;
const https = process.env.FAAS_SSL === "true";
const protocol = https ? "https" : "http";
const faas = `${protocol}://${process.env.FAAS_USER}:${process.env.FAAS_PASS}@${process.env.FAAS_URI}`;
require('console-stamp')(console);


(async () =>
{
    try {
        let res =
            await fetch(`${faas}/system/functions`);
        let functions = await res.json();
        //console.log(functions);
        const eventService = new EventService(process.env.CONNECTOR_NAME,
            {url: kafkaUri, ssl: process.env.KAFKA_SSL === 'true',
                ca: process.env.KAFKA_SSL_CA,
                key: process.env.KAFKA_SSL_KEY,
                cert: process.env.KAFKA_SSL_CERT
            },{ url: process.env.REDIS_CONNECTION, password: process.env.REDIS_PASS,
                port: process.env.REDIS_PORT, tls: process.env.REDIS_SSL }
        );

        if(process.env.TOPICS) {
            let topics = process.env.TOPICS.split(",");
            for (let topic of topics) {
                let f = filter(functions, topic);
                eventService.subscribe(topic,
                    `${topic}`, f, async (payload, done) => {
                        let res = await fetch(`${faas}/function/${payload.data.metadata.function}`, {
                            method: 'post',
                            body: JSON.stringify(payload.data),
                            headers: {'Content-Type': 'application/json'},
                        });
                        if(res.ok) {
                            console.log(await res.json());
                            console.log(`Successfully invoked function: ${payload.data.metadata.function}`)
                        }
                        else{
                            throw Error(JSON.stringify(await res.json()));
                        }
                });
            }

            await eventService.start();
            console.log(`listening to topics: ${process.env.TOPICS}`);

            cron.schedule("*/3 * * * * *", async function() {
                console.log("********** syncing topics and functions ************");
                let res =
                    await fetch(`${faas}/system/functions`);
                let functions = await res.json();
                let topics = process.env.TOPICS.split(",");
                for(let topic of topics){
                    eventService.subscriptions.get(topic).functions = filter(functions, topic);
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
