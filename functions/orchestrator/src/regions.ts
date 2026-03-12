export interface RegionConfig {
  id: string;
  displayName: string;
  lat: number;
  lng: number;
  enabled: boolean;
}

export const REGIONS: RegionConfig[] = [
  { id: 'eastus', displayName: 'East US', lat: 37.3719, lng: -79.8164, enabled: true },
  { id: 'eastus2', displayName: 'East US 2', lat: 36.6681, lng: -78.3889, enabled: true },
  { id: 'westus2', displayName: 'West US 2', lat: 47.233, lng: -119.852, enabled: true },
  { id: 'westeurope', displayName: 'West Europe', lat: 52.3667, lng: 4.9, enabled: true },
  { id: 'southeastasia', displayName: 'Southeast Asia', lat: 1.2834, lng: 103.8607, enabled: true },
  { id: 'australiaeast', displayName: 'Australia East', lat: -33.86, lng: 151.2094, enabled: true },
];

export function getRegionById(id: string): RegionConfig | undefined {
  return REGIONS.find((r) => r.id === id);
}
