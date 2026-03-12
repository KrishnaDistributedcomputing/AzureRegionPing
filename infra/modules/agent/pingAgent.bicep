@description('Azure region to deploy this ping agent')
param location string

@description('Resource name prefix')
param prefix string

@description('App Insights connection string from core deployment')
param appInsightsConnectionString string

@secure()
@description('API key for agent authentication')
param agentApiKey string

@description('Location of the Container Apps Environment (core region)')
param containerEnvLocation string

// Reference the shared Container Apps Environment from core
resource containerEnv 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: '${prefix}-env'
}

// ─── Ping Agent Container App ──────────────────────────────────────
resource agentApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-ping-${location}'
  location: containerEnvLocation
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
      }
      secrets: [
        { name: 'agent-api-key', value: agentApiKey }
        { name: 'appinsights-connection', value: appInsightsConnectionString }
      ]
    }
    template: {
      containers: [
        {
          name: 'ping-agent'
          image: 'mcr.microsoft.com/k8se/quickstart:latest'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'PORT', value: '3000' }
            { name: 'AGENT_API_KEY', secretRef: 'agent-api-key' }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', secretRef: 'appinsights-connection' }
            { name: 'REGION_ID', value: location }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 3
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '20'
              }
            }
          }
        ]
      }
    }
  }
}

output agentUrl string = 'https://${agentApp.properties.configuration.ingress.fqdn}'
output agentName string = agentApp.name
