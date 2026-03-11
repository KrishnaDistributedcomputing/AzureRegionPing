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

// ─── Storage Account (Orchestrator state) ──────────────────────────
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: replace('${prefix}st', '-', '')
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
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
      allowedOrigins: ['*'] // Restrict in prod
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
      defaultTtl: 2592000 // 30 days
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

resource containerAggregates 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-02-15-preview' = {
  parent: cosmosDb
  name: 'aggregates'
  properties: {
    resource: {
      id: 'aggregates'
      partitionKey: { paths: ['/pairKey'], kind: 'Hash' }
    }
  }
}

// ─── Orchestrator Function App ─────────────────────────────────────
resource orchestratorPlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${prefix}-orch-plan'
  location: location
  sku: { name: 'Y1', tier: 'Dynamic' }
  kind: 'functionapp'
}

resource orchestratorFunc 'Microsoft.Web/sites@2023-12-01' = {
  name: '${prefix}-orch-func'
  location: location
  kind: 'functionapp'
  properties: {
    serverFarmId: orchestratorPlan.id
    httpsOnly: true
    siteConfig: {
      nodeVersion: '~20'
      appSettings: [
        { name: 'AzureWebJobsStorage', value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value}' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' }
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
        { name: 'AzureSignalRConnectionString', value: signalR.listKeys().primaryConnectionString }
        { name: 'COSMOS_CONNECTION_STRING', value: cosmosAccount.listConnectionStrings().connectionStrings[0].connectionString }
        { name: 'AGENT_API_KEY', value: agentApiKey }
        { name: 'AGENT_URL_PATTERN', value: 'https://${prefix}-ping-{region}-func.azurewebsites.net' }
      ]
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
output orchestratorUrl string = 'https://${orchestratorFunc.properties.defaultHostName}'
output signalREndpoint string = 'https://${signalR.properties.hostName}'
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
output staticWebAppUrl string = 'https://${staticWebApp.properties.defaultHostname}'
