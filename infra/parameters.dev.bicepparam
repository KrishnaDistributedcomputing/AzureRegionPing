using 'main.bicep'

param location = 'eastus2'
param environment = 'dev'
param agentApiKey = ''
param pingRegions = [
  'eastus'
  'westus2'
  'westeurope'
  'southeastasia'
  'australiaeast'
]
