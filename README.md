# faas-connector

annonations for functions deploy: 

topic = "test-stream" - the kafka topic to listen to

strategy = "fixed" || "expontential" - default fixed

retryLatency = 1000 - in milliseconds - default 1000

retries = 1 how many times to retry the function

delay = 1000 delay the job in milliseconds

