const { Kafka, logLevel } = require('kafkajs');
const uuid = require('uuid');
const Queue = require('bee-queue');
const Event = require('./event');
const Subscription =  require("./subscription");
const fs = require('fs');

class EventService {
    /**
     * requirements: needs an instance of redis and kafka running
     * @constructor
     * @param {string} serviceName - a unique name for the service, this will prefix all new subscriptions created.
     * @param {object} eventConnection - {url: string, user: string, password: string} object that contains required parameters for connecting to EventStore.org
     * @param {object} jobQueueConnection - {url: string, user: string, password: string} object that contains required parameters for connecting to Job Queue
     */
    constructor(serviceName, eventConnection, jobQueueConnection){
        this.eventConnection = eventConnection;
        this.jobQueueConnection = jobQueueConnection;

        let kafakConfig = {
            clientId: serviceName,
            brokers: this.eventConnection.url.split(","),
            connectionTimeout: 4000
        };

        if(this.eventConnection.ssl === true && !this.eventConnection.cert){
            kafakConfig.ssl = true;
        }
        else if(this.eventConnection.ssl){
            kafakConfig.ssl = {
                rejectUnauthorized: false,
                ca: [fs.readFileSync(this.eventConnection.ca, 'utf-8')],
                key: fs.readFileSync(this.eventConnection.key, 'utf-8'),
                cert: fs.readFileSync(this.eventConnection.cert, 'utf-8')
            }
        }

        this.serviceName = serviceName;
        this.subscriptions = new Map();
        this.queues = new Map();
        this.consumers = new Map();
        this.kafka = new Map();

        this.queueOptions= {
            redis: {
                host: this.jobQueueConnection.url,
                password: this.jobQueueConnection.password,
                port: this.jobQueueConnection.port,
                db: 0,
                tls: this.eventConnection.tls,
                options: {
                }
            },
            activateDelayedJobs: true,
            removeOnSuccess: true
        }
    }

    /**
     * Adds a subscription to be created once the service is started
     * @param {string} stream - the stream to listen to events from
     * @param {string} subscriptionName - the name of subscription to create on the server (serviceName_subscription)
     * @param functions- an array functions to execute
     * @param {function} processor - a function to process events or jobs
     * a custom object that will be processed by the processor function, if a transformer is not passed, the event will
     * pass through to the processor and the processor will use the raw event payload
     */
    subscribe(stream, subscriptionName, functions, processor){
        let subscription = new Subscription(stream, subscriptionName, functions, processor);
        this.subscriptions.set(stream, subscription);
        return this.subscriptions.get(stream);
    }

    /**
     * First operation that should be called after creating the service
     */
    async start(){
        for(let subname of this.subscriptions.keys()) {
            const subscription = this.subscriptions.get(subname);
            await this._createSubscription(subscription);
            this._createQueue(subscription);
            await this._connectToSubscription(subscription);
        }
    }

    _createQueue(subscription){
        const queue = new Queue(subscription.name, this.queueOptions);
        this.queues.set(subscription.name, queue);
        queue.process(subscription.processor);
    }

    async _createSubscription(subscription){
        try {
            let connection = {
                logLevel: logLevel.INFO,
                brokers: [this.eventConnection.url],
                clientId: this.serviceName.concat("_", subscription.name) + uuid.v4().toString(),
            };

            if(this.eventConnection.ssl){
                connection.ssl = {
                    rejectUnauthorized: false,
                    ca: [fs.readFileSync(this.eventConnection.ca, 'utf-8')],
                    key: fs.readFileSync(this.eventConnection.key, 'utf-8'),
                    cert: fs.readFileSync(this.eventConnection.cert, 'utf-8')
                };
            }

            this.kafka.set(subscription.stream, new Kafka(connection));

            this.consumers.set(subscription.stream, this.kafka.get(subscription.stream)
                .consumer({ groupId: this.serviceName.concat("_", subscription.name)}));

        }  catch (error) {
            console.error(error);
        }
    }

    async _connectToSubscription(subscription){
        await this.consumers.get(subscription.stream).connect();
        await this.consumers.get(subscription.stream).subscribe({topic: subscription.stream});
        await this.consumers.get(subscription.stream).run({
            eachMessage: async ({ topic, partition, message }) => {
                let event = EventService._convertDataToEvent(message);
                for(let f of subscription.functions){
                    event.metadata = {function: f.name };
                    const queue = this.queues.get(subscription.name);
                    let job = queue.createJob(event);
                    if(!f.annotations.strategy) { f.annotations.strategy = 'fixed'; }
                    if (f.annotations.strategy === 'fixed' || f.strategy === 'exponential') {
                        if(!f.annotations.retryLatency){f.annotations.retryLatency = 1000 ;}
                        job.backoff(f.annotations.strategy, f.annotations.retryLatency);
                    }

                    if(f.annotations.delay) {
                        job.delayUntil(new Date(Date.now() + f.annotations.delay));
                    }

                    if(f.annotations.retries) {
                        job.retries(f.annotations.retries);
                    }else{
                        job.retries(1);
                    }

                    job.save();
                }
            }
        });
    }

    /**
     * This will close all connections to the server, leaving subscriptions as is
     */
    async stop(){
        for(let consumer of this.consumers.keys()){
            this.consumers.get(consumer).disconnect();
        }

        for(let queue of this.queues.keys()) {
            this.queues.get(queue).close();
        }
    }

    static createEvent(name, content, metadata){
        return new Event(0,name,new Date(),content,metadata);
    }

    static _convertDataToEvent(ev){
        let message = JSON.parse(ev.value);
        if(!message.type || message.type instanceof String){
            console.error("Event does not have a type or type in wrong format");
            return null;
        }
        return new Event(ev.offset, message.type, new Date(0).setUTCSeconds(ev.timestamp),
            message.content);
    }
}

module.exports = EventService;
