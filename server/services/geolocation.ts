interface GeolocationResult {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
}

interface IpApiResponse {
  status: string;
  city?: string;
  country?: string;
  lat?: number;
  lon?: number;
  message?: string;
}

class GeolocationService {
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 1400; // 1.4 seconds to stay under 45 req/min
  
  async lookupIp(ipAddress: string): Promise<GeolocationResult | null> {
    // Skip localhost and private IPs
    if (ipAddress === 'unknown' || 
        ipAddress === 'localhost' || 
        ipAddress === '127.0.0.1' ||
        ipAddress.startsWith('192.168.') ||
        ipAddress.startsWith('10.') ||
        ipAddress.startsWith('172.')) {
      return null;
    }

    // Rate limiting: ensure we don't exceed 45 requests per minute
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    try {
      this.lastRequestTime = Date.now();
      
      // Use ip-api.com free tier (45 req/min, no API key needed)
      const response = await fetch(`http://ip-api.com/json/${ipAddress}?fields=status,message,country,city,lat,lon`);
      
      if (!response.ok) {
        console.error(`Geolocation API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data: IpApiResponse = await response.json();
      
      if (data.status !== 'success') {
        console.error(`Geolocation lookup failed for ${ipAddress}: ${data.message}`);
        return null;
      }

      if (!data.city || !data.country || data.lat === undefined || data.lon === undefined) {
        return null;
      }

      return {
        city: data.city,
        country: data.country,
        latitude: data.lat,
        longitude: data.lon,
      };
    } catch (error) {
      console.error(`Error looking up geolocation for ${ipAddress}:`, error);
      return null;
    }
  }
}

export const geolocationService = new GeolocationService();
