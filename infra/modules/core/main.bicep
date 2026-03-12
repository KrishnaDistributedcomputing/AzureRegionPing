@description('Primary location for core resources')
param location string

@description('Resource name prefix')
param prefix string

@secure()
@description('API key for agent authentication')
param agentApiKey string

// ─── Application Insights + Log Analytics ─────────────────────────
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${prefix}-appi'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// ─── Azure SignalR Service ─────────────────────────────────────────
resource signalR 'Microsoft.SignalRService/signalR@2023-08-01-preview' = {
  name: '${prefix}-signalr'
  location: location
  sku: {
    name: 'Free_F1'
    capacity: 1
  }
  kind: 'SignalR'
  properties: {
    features: [
      { flag: 'ServiceMode', value: 'Serverless' }
      { flag: 'EnableConnectivityLogs', value: 'True' }
    ]
    cors: {
      allowedOrigins: ['*']
    }
  }
}

// ─── Cosmos DB ─────────────────────────────────────────────────────
resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-02-15-preview' = {
  name: '${prefix}-cosmos'
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [{ locationName: location, failoverPriority: 0 }]
    capabilities: [{ name: 'EnableServerless' }]
    consistencyPolicy: { defaultConsistencyLevel: 'Session' }
  }
}

resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-02-15-preview' = {
  parent: cosmosAccount
  name: 'azureregionping'
  properties: {
    resource: { id: 'azureregionping' }
  }
}

resource containerSessions 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-02-15-preview' = {
  parent: cosmosDb
  name: 'sessions'
  properties: {
    resource: {
      id: 'sessions'
      partitionKey: { paths: ['/id'], kind: 'Hash' }
      defaultTtl: 2592000
    }
  }
}

resource containerResults 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-02-15-preview' = {
  parent: cosmosDb
  name: 'results'
  properties: {
    resource: {
      id: 'results'
      partitionKey: { paths: ['/sessionId'], kind: 'Hash' }
      defaultTtl: 2592000
    }
  }
}

// ─── Container Apps Environment ────────────────────────────────────
resource containerEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${prefix}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// ─── Orchestrator Container App ────────────────────────────────────
resource orchestratorApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-orch'
  location: location
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
        corsPolicy: {
          allowedOrigins: ['*']
          allowedMethods: ['GET', 'POST', 'OPTIONS']
          allowedHeaders: ['*']
        }
      }
      secrets: [
        { name: 'agent-api-key', value: agentApiKey }
        { name: 'cosmos-connection', value: cosmosAccount.listConnectionStrings().connectionStrings[0].connectionString }
        { name: 'signalr-connection', value: signalR.listKeys().primaryConnectionString }
        { name: 'appinsights-connection', value: appInsights.properties.ConnectionString }
      ]
    }
    template: {
      containers: [
        {
          name: 'orchestrator'
          image: 'mcr.microsoft.com/k8se/quickstart:latest'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'PORT', value: '3000' }
            { name: 'AGENT_API_KEY', secretRef: 'agent-api-key' }
            { name: 'COSMOS_CONNECTION_STRING', secretRef: 'cosmos-connection' }
            { name: 'SIGNALR_CONNECTION_STRING', secretRef: 'signalr-connection' }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', secretRef: 'appinsights-connection' }
            { name: 'AGENT_URL_PATTERN', value: 'https://${prefix}-ping-{region}.${containerEnv.properties.defaultDomain}' }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 5
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

// ─── Static Web App (Frontend) ─────────────────────────────────────
resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: '${prefix}-swa'
  location: location
  sku: { name: 'Free', tier: 'Free' }
  properties: {}
}

// ─── Outputs ───────────────────────────────────────────────────────
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output orchestratorUrl string = 'https://${orchestratorApp.properties.configuration.ingress.fqdn}'
output orchestratorAppName string = orchestratorApp.name
output signalREndpoint string = 'https://${signalR.properties.hostName}'
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
output staticWebAppUrl string = 'https://${staticWebApp.properties.defaultHostname}'
output containerEnvId string = containerEnv.id
output containerEnvDomain string = containerEnv.properties.defaultDomain
