# openfaas-kafka-connector

An OpenFaaS kafka connector written in node.js with retries, back-off strategies, and delayed function invokes.
You can deploy on the same cluster as OpenFaaS or externally as long as the connector has access to OpenFaaS gateway.

[Check out OpenFaaS](https://www.openfaas.com/)


### Configuration recommended 
1. You will need to add a redis instance in the cluster, [Redis helm chart](https://github.com/helm/charts/tree/master/stable/redis)
2. Make sure you deploy this in the same namespace as openFaaS, this will use the secret created for basic auth on the OpenFaaS gateway
3. If secure connection is required for kafka and redis please create these secrets in the openFaas namespace

```
kubectl create secret generic openfaas-connector \
--from-file=kafka-ssl-ca=ca.pem \
--from-file=kafka-ssl-cert=service.cert \
--from-file=kafka-ssl-key=service.key \ 
--from-literal=redis-pass=password --namespace openfaas
```

4. Deploy openfaas-kafka-connector with helm chart

Note: you can deploy the connector anywhere, in this case you can use env vars to set connector
configuration  

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


### Annonations for function deploy: 
```
"topic": "test-stream, another-stream" - the kafka topic to listen to
"strategy":"fixed" || "expontential" - default fixed
"retryLatency": 1000 - in milliseconds - default 1000
"retries" : 1 how many times to retry the function
"delay" : 1000 delay the job in milliseconds
```
If you do not include the "TOPICS" environment variable the connector will auto subscribe to topics 

## Environment  settings
```
CONNECTOR_NAME=faas-connector
GATEWAY_URI=gateway:8080
GATEWAY_USER=user
GATEWAY_PASS=password
GATEWAY_SSL=true
#Excluding TOPICS will auto subscribe to topics that functions are using
#TOPICS=test-stream-1,test-stream-2 
KAFKA_CONNECTION=127.0.0.1:9092
KAFKA_SSL=false
# use secrets for these when possible
KAFKA_SSL_CA=../ca.pem
KAFKA_SSL_KEY=../service.key
KAFKA_SSL_CERT=../service.cert
# ------
REDIS_CONNECTION=127.0.0.1
# use secrets for this when possible
REDIS_PASS=password
# -----
REDIS_SSL=false
REDIS_PORT=6379
```




