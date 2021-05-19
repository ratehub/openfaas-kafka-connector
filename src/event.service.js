const newrelic = require('newrelic');
const { Kafka, logLevel } = require('kafkajs');
const uuid = require('uuid');
const Queue = require('bee-queue');
const Event = require('./event');
const Subscription =  require("./subscription");
const fs = require('fs');
let safeEval = require('safe-eval');

class EventService {
    /**
     * requirements: needs an instance of redis and kafka running
     * @constructor
     * @param {string} serviceName - a unique name for the service, this will prefix all new subscriptions created.
     * @param {object} eventConnection - {url: string, user: string, password: string} object that contains required parameters for connecting to EventStore.org
     * @param {object} jobQueueConnection - {url: string, user: string, password: string} object that contains required parameters for connecting to Job Queue
     * @param {boolean} perFunctionQueue - create job queue per function, this will increase the amount of redis connections
     */
    constructor(serviceName, eventConnection, jobQueueConnection,perFunctionQueue, logger){
        this.eventConnection = eventConnection;
        this.jobQueueConnection = jobQueueConnection;
        this.serviceName = serviceName;
        this.subscriptions = new Map();
        this.queues = new Map();
        this.consumers = new Map();
        this.kafka = new Map();
        this.perFunctionQueue = perFunctionQueue;
        this.logger = logger;

        this.queueOptions= {
            redis: {
                host: this.jobQueueConnection.url,
                password: this.jobQueueConnection.password,
                port: this.jobQueueConnection.port,
                db: 0,
                tls: this.jobQueueConnection.tls,
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
     * @param concurrency - an integer of how many current process can be on a queue
     * @param {function} processor - a function to process events or jobs
     * a custom object that will be processed by the processor function, if a transformer is not passed, the event will
     * pass through to the processor and the processor will use the raw event payload
     */
    subscribe(stream, subscriptionName, functions, concurrency, processor){
        let subscription = new Subscription(stream, subscriptionName, functions,  concurrency, processor);
        this.subscriptions.set(stream, subscription);
        return this.subscriptions.get(stream);
    }

    async enableSubscription(subscription) {
        await this._createSubscription(subscription);
        this._createQueue(subscription);
        await this._connectToSubscription(subscription);
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
        queue.process(subscription.concurrency, subscription.processor);
    }

    async _createSubscription(subscription){
        try {
            let connection = {
                logLevel: logLevel.INFO,
                brokers: this.eventConnection.url.split(","),
                clientId: this.serviceName.concat("_", subscription.name) + uuid.v4().toString(),
            };

            if(this.eventConnection.ssl === true && !this.eventConnection.cert){
                connection.ssl = true;
            }
            else if(this.eventConnection.ssl){
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
            this.logger.error(error.message);
            newrelic.noticeError(error);
        }
    }

    _createOrGetFunctionQueue(faasFunction, subscription){
        let queue = this.queues.get(faasFunction.name);
        if(queue){ return queue; }

        queue = new Queue(faasFunction.name, this.queueOptions);
        this.queues.set(faasFunction.name, queue);
        queue.process(subscription.concurrency, subscription.processor);
        return queue;
    }

    async _connectToSubscription(subscription){
        await this.consumers.get(subscription.stream).connect();
        await this.consumers.get(subscription.stream).subscribe({topic: subscription.stream});
        await this.consumers.get(subscription.stream).run({
            eachMessage: async ({ topic, partition, message }) => {
                let event = EventService._convertDataToEvent(message);
                if(event == null) { return }
                this.logger.info(`Event: ${event.type} occurred at: ${event.occurredAt}`);
                for(let f of subscription.functions){
                    event.metadata.function = f.name;
                    if (typeof f.annotations.filter === "string") {
                        let context = {
                            event
                        };

                        try {
                            if (safeEval(f.annotations.filter, context) === false) {
                                this.logger.info(`Pre-filter not true, job not created for function: ${f.name}`);
                                continue;
                            }
                        }catch(error){
                            this.logger.error(`Job not created, error in pre-filter for function: ${f.name}`)
                            this.logger.error(error.message);
                            newrelic.noticeError(error);
                            continue;
                        }

                        event.metadata.filter = f.annotations.filter;
                    }

                    let queue = null;
                    let queueName = null;

                    if(this.perFunctionQueue){
                        queue = this._createOrGetFunctionQueue(f,subscription);
                        queueName = f.name;
                    }
                    else{
                        queue = this.queues.get(subscription.name);
                        queueName = subscription.name;
                    }

                    if(!queue){
                        this.logger.error(`Queue not found: ${queueName}`);
                        newrelic.noticeError(new Error(`Queue not found: ${queueName}`));
                        continue;
                    }

                    let job = queue.createJob(event);

                    if (f.annotations.strategy === 'fixed' || f.annotations.strategy === 'exponential') {
                        if(!f.annotations.retryLatency){f.annotations.retryLatency = 1000 ;}
                        job.backoff(f.annotations.strategy, Number(f.annotations.retryLatency));
                        if(f.annotations.retries) {
                            job.retries(f.annotations.retries);
                        }
                    }

                    //annotations can be string or number
                    if(event.metadata.delay && !isNaN(event.metadata.delay)){
                        job.delayUntil(new Date(Date.now() + Number(event.metadata.delay)));
                    }else if(f.annotations.delay && !isNaN(f.annotations.delay)) {
                        job.delayUntil(new Date(Date.now() + Number(f.annotations.delay)));
                    }

                    await job.save();
                    this.logger.info(`Created job for function: ${f.name}`);
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

    static createEvent(type, content, metadata){
        return new Event(0,type,new Date(),content,metadata);
    }

    static _convertDataToEvent(ev){
        try {
            let message = JSON.parse(ev.value);
            if (!message.type || message.type instanceof String) {
                this.logger.error("Event does not have a type or type in wrong format");
                return null;
            }
            return new Event(ev.offset, message.type, new Date(0).setUTCSeconds(ev.timestamp),
                message.content, message.metadata);
        }catch(error){
            this.logger.error(`Payload not in Json format: ${error.message}`);
            return null;
        }
    }
}

module.exports = EventService;
