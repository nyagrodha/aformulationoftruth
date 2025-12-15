// IP Geolocation lookup using ipinfo.io API
// Retrieves detailed geolocation data for IP addresses
const IPINFO_TOKEN = process.env.IPINFO_TOKEN;
/**
 * Look up geolocation data for an IP address using ipinfo.io
 * @param ipAddress - The IP address to look up
 * @returns IPInfo object with geolocation data, or null on error
 */
export async function lookupIPAddress(ipAddress) {
    try {
        // Skip lookup for localhost/private IPs
        if (ipAddress === '::1' || ipAddress === '127.0.0.1' || ipAddress.startsWith('192.168.') || ipAddress.startsWith('10.') || ipAddress.startsWith('172.')) {
            return {
                ip: ipAddress,
                hostname: 'localhost',
                city: 'Local',
                region: 'Local',
                country: 'Local',
                location: '0,0',
                postal_code: null,
                timezone: null,
                org: 'Local Network',
                asn: null,
                is_vpn: false,
                is_proxy: false,
                is_tor: false,
                is_hosting: false,
                is_relay: false,
                raw_response: { ip: ipAddress, bogon: true }
            };
        }
        const url = IPINFO_TOKEN
            ? `https://ipinfo.io/${ipAddress}?token=${IPINFO_TOKEN}`
            : `https://ipinfo.io/${ipAddress}/json`;
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`ipinfo.io API error: ${response.status} ${response.statusText}`);
            return null;
        }
        const data = await response.json();
        // Parse privacy data (only available with paid plan)
        const privacy = data.privacy || {};
        return {
            ip: data.ip,
            hostname: data.hostname || null,
            city: data.city || null,
            region: data.region || null,
            country: data.country || null,
            location: data.loc || null,
            postal_code: data.postal || null,
            timezone: data.timezone || null,
            org: data.org || null,
            asn: data.asn?.asn || null,
            is_vpn: privacy.vpn || false,
            is_proxy: privacy.proxy || false,
            is_tor: privacy.tor || false,
            is_hosting: privacy.hosting || false,
            is_relay: privacy.relay || false,
            raw_response: data
        };
    }
    catch (error) {
        console.error('IP lookup failed:', error);
        return null;
    }
}
/**
 * In-memory cache for IP lookups to reduce API calls
 * Cache entries expire after 24 hours
 */
const ipCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
/**
 * Get IP info with caching to reduce API calls
 * @param ip - The IP address to look up
 * @returns IPInfo object with geolocation data, or null on error
 */
export async function getCachedIPInfo(ip) {
    // Check cache first
    const cached = ipCache.get(ip);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data;
    }
    // Lookup and cache
    const data = await lookupIPAddress(ip);
    if (data) {
        ipCache.set(ip, { data, timestamp: Date.now() });
        // Auto-cleanup old entries
        setTimeout(() => ipCache.delete(ip), CACHE_TTL);
    }
    return data;
}
