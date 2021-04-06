# openfaas-kafka-connector

![Version: 1.1.0](https://img.shields.io/badge/Version-1.1.0-informational?style=flat-square) ![Type: application](https://img.shields.io/badge/Type-application-informational?style=flat-square) ![AppVersion: 1.4.6](https://img.shields.io/badge/AppVersion-1.4.6-informational?style=flat-square)

A Helm chart for ratehub's openfaas kafka connector

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| affinity | object | `{}` |  |
| autoscaling.enabled | bool | `false` |  |
| autoscaling.maxReplicas | int | `100` |  |
| autoscaling.minReplicas | int | `1` |  |
| autoscaling.targetCPUUtilizationPercentage | int | `80` |  |
| basicAuthSecrets.existingSecrets | bool | `true` |  |
| basicAuthSecrets.nameOverride | string | `""` |  |
| basicAuthSecrets.values.basic-auth-password | string | `""` |  |
| basicAuthSecrets.values.basic-auth-user | string | `""` |  |
| fullnameOverride | string | `""` |  |
| image.pullPolicy | string | `"IfNotPresent"` |  |
| image.repository | string | `"gcr.io/platform-235214/openfaas-kafka-connector"` |  |
| image.tag | string | `""` |  |
| imagePullSecrets[0].name | string | `"gcr-pull-secret"` |  |
| kafkaConnectorSecrets.existingSecrets | bool | `true` |  |
| kafkaConnectorSecrets.nameOverride | string | `""` |  |
| kafkaConnectorSecrets.values.kafka-ssl-ca | string | `""` |  |
| kafkaConnectorSecrets.values.kafka-ssl-cert | string | `""` |  |
| kafkaConnectorSecrets.values.kafka-ssl-key | string | `""` |  |
| kafkaConnectorSecrets.values.redis-pass | string | `""` |  |
| linkerd.enabled | bool | `true` |  |
| nameOverride | string | `""` |  |
| nodeSelector | object | `{}` |  |
| podAnnotations | object | `{}` |  |
| podSecurityContext.fsGroup | int | `2000` |  |
| replicaCount | int | `1` |  |
| resources | object | `{}` |  |
| securityContext.readOnlyRootFilesystem | bool | `true` |  |
| securityContext.runAsNonRoot | bool | `true` |  |
| securityContext.runAsUser | int | `1000` |  |
| serviceAccount.annotations | object | `{}` |  |
| serviceAccount.create | bool | `true` |  |
| serviceAccount.name | string | `""` |  |
| settings.concurrency | int | `4` |  |
| settings.connector_name | string | `"openfaas-kafka-connector"` |  |
| settings.gateway_ssl | bool | `false` |  |
| settings.gateway_uri | string | `"gateway:8080"` |  |
| settings.kafka_connection | string | `"127.0.0.1:9092"` |  |
| settings.kafka_ssl | bool | `false` |  |
| settings.newRelicAppName | string | `"[dev] openfaas-kafka-connector"` |  |
| settings.newRelicEnable | bool | `false` |  |
| settings.newRelicLicense | string | `"license_key_here"` |  |
| settings.perFunctionJobQueue | bool | `false` |  |
| settings.redis_connection | string | `"127.0.0.1"` |  |
| settings.redis_port | int | `6379` |  |
| settings.redis_ssl | bool | `false` |  |
| tolerations | list | `[]` |  |

