# SCADA Proxy Security Configuration Guide

Quick reference for deploying the SCADA proxy securely in production environments.

---

## Critical: Production Deployment

### Step 1: Set Environment Variables

Create `.env` file (DO NOT commit to git):

```bash
# CRITICAL: Set to production to enable OPC-UA encryption
NODE_ENV=production

# Server configuration
PORT=3001
POLL_INTERVAL=1000

# OPC-UA connection (ensure server supports SignAndEncrypt)
OPCUA_ENDPOINT=opc.tcp://your-opcua-server:4840

# Optional: Modbus TCP
# MODBUS_HOST=192.168.1.100
# MODBUS_PORT=502
```

### Step 2: Verify Security Settings

Check that OPC-UA encryption is enabled:

```bash
# Start the server and look for this message:
# ❌ BAD (Insecure):
# [OPCUAAdapter] WARNING: Running with NO security (development mode)

# ✅ GOOD (Secure):
# [OPCUAAdapter] Connected to opc.tcp://server:4840
# (No warning message = encryption enabled)
```

### Step 3: OPC-UA Server Certificate Setup

Production uses signing, encryption and the native NodeOPCUA PKI trust store. Before
connecting, the adapter disables automatic certificate acceptance unless
`NODE_ENV` is exactly `development`. Unknown self-signed certificates and CA-issued
certificates with unavailable revocation status are rejected.

The existing platform-specific `node-opcua-default` configuration directory and its
`PKI` subdirectory are unchanged. Authenticate server and issuer certificates through
a trusted out-of-band channel, then use your PKI administration process or the
certificate manager's `trustCertificate` API to grant trust. CA-issued certificates
also need a valid issuer chain and current CRLs. Valid chains anchored in trusted
CAs remain supported; this policy does not require pinning every leaf certificate.

Review previously trusted entries before production activation. The change preserves
existing store contents, including certificates accepted under earlier permissive
settings, and does not establish their provenance. The adapter does not implement
an `OPCUA_SERVER_CERT` environment option. Supplying a server certificate directly
is not a substitute for certificate-manager validation.

Working if production rejects unknown certificates and missing-CRL chains without
promoting them to trusted, while explicit valid trust and development behavior pass
`npm run test:trust`.

---

## Security Modes Explained

### OPC-UA Security Modes

| Mode | Value | Description | Use Case |
|------|-------|-------------|----------|
| **None** | 1 | No encryption, no signing | Development/testing only |
| **Sign** | 2 | Messages signed but not encrypted | Low-security environments |
| **SignAndEncrypt** | 3 | Full encryption + signing | **Production (REQUIRED)** |

### OPC-UA Security Policies

| Policy | Encryption | Hash | Key Size | Recommendation |
|--------|-----------|------|----------|----------------|
| None | - | - | - | Development only |
| Basic128Rsa15 | AES-128 | SHA-1 | 1024-2048 bit | **Deprecated** |
| Basic256 | AES-256 | SHA-1 | 2048-4096 bit | **Deprecated** |
| **Basic256Sha256** | **AES-256** | **SHA-256** | **2048-4096 bit** | **RECOMMENDED** |

---

## Security Testing

### Test 1: Verify OPC-UA Encryption

```bash
# Development mode (should show warning):
NODE_ENV=development npm run dev
# Expected: [OPCUAAdapter] WARNING: Running with NO security

# Production mode (no warning):
NODE_ENV=production npm run dev
# Expected: No security warnings
```

### Test 2: Network Traffic Analysis

```bash
# Install Wireshark or tcpdump
sudo tcpdump -i any -w opcua-traffic.pcap port 4840

# Development mode: You can see plaintext data
# Production mode: Encrypted traffic (gibberish)
```

### Test 3: Security Scan

```bash
# Check for known vulnerabilities
npm audit --audit-level=moderate

# Check for outdated packages
npm outdated

# Static security analysis
npx eslint src/**/*.ts --ext .ts
```

---

## Common Security Issues & Solutions

### Issue 1: "SecurityPolicy Basic256Sha256 not supported"

**Cause:** OPC-UA server doesn't support the security policy.

**Solution:**
1. Check server capabilities: `opcua-client -e opc.tcp://server:4840 -s`
2. Use a supported policy (fallback to Basic256 if necessary)
3. Upgrade OPC-UA server to support modern security

### Issue 2: "Certificate validation failed"

**Cause:** The server certificate is untrusted, its chain is incomplete, its CRL is
unavailable, or another certificate validation check failed.

**Solution:** Verify certificate identity and issuer provenance out of band, then
review the existing PKI store and provision authenticated trust anchors and current
CRLs. Investigate the reported validation status. Keep production auto-accept
disabled; changing `NODE_ENV` to development is not a production workaround.

### Issue 3: "Connection refused" in production

**Cause:** Firewall blocking OPC-UA port 4840.

**Solution:**
```bash
# Check firewall rules
sudo iptables -L -n | grep 4840

# Allow outbound connection to OPC-UA server
sudo iptables -A OUTPUT -p tcp --dport 4840 -d SERVER_IP -j ACCEPT
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] `NODE_ENV=production` set in environment
- [ ] `.env` file created with all required variables
- [ ] `.env` added to `.gitignore` (never commit secrets!)
- [ ] OPC-UA server certificates obtained and validated
- [ ] Network firewall rules configured
- [ ] HTTPS/TLS certificates generated for REST API
- [ ] Security audit completed

### Post-Deployment

- [ ] Verify no security warnings in logs
- [ ] Test OPC-UA connection with encryption
- [ ] Confirm network traffic is encrypted (Wireshark)
- [ ] Monitor for connection errors
- [ ] Set up audit logging
- [ ] Configure alerts for security events

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | **YES** | `development` | **CRITICAL:** Must be `production` for encryption |
| `PORT` | No | `3001` | HTTP server port |
| `POLL_INTERVAL` | No | `1000` | Tag polling interval (ms) |
| `OPCUA_ENDPOINT` | No | - | OPC-UA server URL |
| `MODBUS_HOST` | No | - | Modbus TCP host |
| `MODBUS_PORT` | No | `502` | Modbus TCP port |

### Future Variables (When Authentication Added)

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Secret key for JWT signing (min 256 bits) |
| `API_KEY` | API key for client authentication |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |
| `TLS_KEY_PATH` | Path to TLS private key |
| `TLS_CERT_PATH` | Path to TLS certificate |

---

## Docker Deployment

### Secure Docker Compose

```yaml
version: '3.8'

services:
  scada-proxy:
    build: .
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production  # CRITICAL: Enable encryption
      - PORT=3001
      - POLL_INTERVAL=1000
      - OPCUA_ENDPOINT=opc.tcp://opcua-server:4840
    volumes:
      # Mount certificates (read-only)
      - ./certs:/app/certs:ro
      # Mount logs (write-only for security)
      - ./logs:/var/log/scada-proxy
    networks:
      - scada-internal
    # Security hardening
    read_only: true
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    tmpfs:
      - /tmp

networks:
  scada-internal:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

### Build and Run

```bash
# Build image
docker-compose build

# Start in production mode
docker-compose up -d

# Check logs for security warnings
docker-compose logs scada-proxy | grep -i security

# Should NOT see: "WARNING: Running with NO security"
```

---

## Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: scada-proxy
spec:
  replicas: 2
  selector:
    matchLabels:
      app: scada-proxy
  template:
    metadata:
      labels:
        app: scada-proxy
    spec:
      containers:
      - name: scada-proxy
        image: millos-scada-proxy:latest
        ports:
        - containerPort: 3001
        env:
        - name: NODE_ENV
          value: "production"  # CRITICAL
        - name: OPCUA_ENDPOINT
          valueFrom:
            configMapKeyRef:
              name: scada-config
              key: opcua-endpoint
        # Mount secrets for certificates
        volumeMounts:
        - name: opcua-certs
          mountPath: /app/certs
          readOnly: true
        # Security context
        securityContext:
          runAsNonRoot: true
          runAsUser: 1001
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          capabilities:
            drop:
            - ALL
      volumes:
      - name: opcua-certs
        secret:
          secretName: opcua-certificates
---
apiVersion: v1
kind: Service
metadata:
  name: scada-proxy
spec:
  type: ClusterIP
  ports:
  - port: 3001
    targetPort: 3001
  selector:
    app: scada-proxy
```

---

## Monitoring Security

### Log Monitoring

```bash
# Watch for security warnings
tail -f logs/scada-proxy.log | grep -i "warning\|security\|error"

# Monitor failed connections
tail -f logs/scada-proxy.log | grep "Connection failed"

# Audit tag writes
tail -f logs/scada-proxy.log | grep "Write\|writeValue"
```

### Metrics to Track

1. **Connection Security Status**
   - OPC-UA securityMode in use
   - Certificate expiration dates
   - Failed authentication attempts

2. **Performance & Availability**
   - Connection uptime
   - Failed connection attempts
   - Average response time

3. **Security Events**
   - Invalid tag write attempts
   - Rate limit violations
   - Unusual data patterns

---

## Support & Resources

### Getting Help

- **Security Issues:** Report to security team immediately
- **Configuration Help:** See `SECURITY_AUDIT.md` for detailed guidance
- **OPC-UA Debugging:** Enable debug logging: `DEBUG=opcua:* npm start`

### Additional Reading

- [OPC Foundation Security](https://opcfoundation.org/about/opc-technologies/opc-ua/ua-security/)
- [NIST ICS Security Guide](https://csrc.nist.gov/publications/detail/sp/800-82/rev-2/final)
- [OWASP Top 10](https://owasp.org/Top10/)

---

**Last Updated:** 2025-12-04
**Reviewed By:** Security Team
**Next Review:** 2026-01-04
