# (WIP ALPHA) openfaas-kafka-connector
## Note: this is still a WIP and is under-going testing

An OpenFaaS kafka connector written in node.js with retries, back-off strategies, and delayed function invokes.
You can deploy on the same cluster as OpenFaaS or externally as long as the connector has access to OpenFaaS gateway.

[Check out OpenFaaS](https://www.openfaas.com/)

The connector has a dependency on redis. 

Kafka does not enforce a payload structure, we have abstracted this into a Event object, your functions
will receive a  payload in the schema of: 

```javascript
{ 
  sequenceNumber: '238',
  type: 'event-type',
  occurredAt: 1570734688789000,
  content:{ 
     property1: 'hello rates',
     property2: 'can put any JSON payload in content that you want'
  },
  metadata: { 
    function: 'repeat' 
  } 
}
```
In order for the kafka connector to deserialize the kafka payload, it must be in json format and
the raw format must be (once published to kafka it will be transformed to the above format): 
```javascript
{
  "type": "event-type",
  "content": {
     property1: 'hello rates',
     property2: 'can put any JSON payload in content that you want'
  }
}
```

This was necessitated because kafka does not enforce any payload schema by default; we use 
event store and event sourcing patterns, which we have an event-service library abstraction that can be integrated into any
node.js project for event consuming and producing. (TBA for public npm package)


Helm chart coming soon! 

### Annonations for function deploy: 

`topic = "test-stream" - the kafka topic to listen to`

`strategy = "fixed" || "expontential" - default fixed`

`retryLatency = 1000 - in milliseconds - default 1000`

`retries = 1 how many times to retry the function`

`delay = 1000 delay the job in milliseconds`

## Environment  settings
```
CONNECTOR_NAME=faas-connector
FAAS_URI=<uri:port>
FAAS_USER=<gateway username>
FAAS_PASS=<gateway password>
FAAS_SSL=true 
TOPICS=test-topic1, test-topic2
KAFKA_CONNECTION=<kafka broker uri:port>
KAFKA_SSL=true
KAFKA_SSL_CA=../ca.pem
KAFKA_SSL_KEY=../service.key
KAFKA_SSL_CERT=../service.cert
REDIS_CONNECTION=127.0.0.1
REDIS_PASS=password
REDIS_SSL=true
REDIS_PORT=6379



