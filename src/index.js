const EventService  = require('./event.service');
const fetch = require('node-fetch');
const _ = require('lodash');
const dotenv = require('dotenv').config({path: __dirname + '/.env'});

const kafkaUri = process.env.KAFKA_CONNECTION;
const https = process.env.FAAS_SSL === "true";
const protocol = https ? "https" : "http";
const faas = `{protocol}://${process.env.FAAS_USER}:${process.env.FAAS_PASS}@${process.env.FAAS_URI}/function/`;

(async () =>
{
    try {
        let res =
            await fetch(`https://${process.env.FAAS_USER}:${process.env.FAAS_PASS}@${process.env.FAAS_URI}/system/functions`);
        let functions = await res.json();
        //console.log(functions);
        const eventService = new EventService(process.env.CONNECTOR_NAME,
            {url: kafkaUri, ssl: process.env.KAFKA_SSL,
                ca: process.env.KAFKA_SSL_CA,
                key: process.env.KAFKA_SSL_KEY,
                cert: process.env.KAFKA_SSL_CERT
            },{ url: process.env.REDIS_CONNECTION, password: process.env.REDIS_PASS,
                port: process.env.REDIS_PORT, tls: process.env.REDIS_SSL }
        );

        if(process.env.TOPICS) {
            let topics = process.env.TOPICS.split(",");
            for (let topic of topics) {
                let f = _.filter(functions, ['annotations.topic', topic]);
                if(f.length === 0){ continue; }
                eventService.subscribe(process.env.TOPICS,
                    `${process.env.CONNECTOR_NAME}-${process.env.TOPICS}`, f, async (payload, done) => {
                        let r = await fetch(`${faas}${payload.data.metadata.function}`, {
                            method: 'post',
                            body: JSON.stringify(payload.data),
                            headers: {'Content-Type': 'application/json'},
                        });
                        console.log(await r.json());
                    });
            }

            await eventService.start();
        }
        else{
            console.error("No topics have been defined, please set env setting TOPICS with a comma delimited string")
        }
    }
    catch(error){
       console.error(error);
    }
})();
