# ByeBuy SQL Injection Security Testing

This repository contains a comprehensive SQL injection testing framework for ByeBuy, implemented according to the **OWASP Web Security Testing Guide (WSTG) Chapter 4.7.5: Testing for SQL Injection**.

## 🎯 Overview

ByeBuy is an auction platform built with Next.js and Supabase. This testing framework systematically evaluates the application's resilience against SQL injection attacks, focusing on user input points that interact with the PostgreSQL database through Supabase's PostgREST API.

## 📁 Files in This Security Testing Suite

```
├── sql-injection-test-suite.js      # Main automated testing script
├── demo-sql-injection-test.js       # Demonstration and educational script
├── SQL_INJECTION_TESTING_GUIDE.md   # Comprehensive testing guide
└── SECURITY_TESTING_README.md       # This file
```

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- Access to ByeBuy application (local or deployed)

### Running Tests

```bash
# Test local development server
npm run security:sql-injection

# Test production server
npm run security:sql-injection:prod

# Test custom URL
node sql-injection-test-suite.js https://your-byebuy-instance.com

# View demonstration
node demo-sql-injection-test.js
```

## 🔍 What Gets Tested

### Primary Test Targets

1. **Search Functionality** (`/listings?search=PAYLOAD`)
   - Most critical attack vector
   - Tests Supabase `.ilike()` query parameterization
   - Validates PostgREST SQL injection protection

2. **RPC Functions**
   - `get_distinct_listing_ids_for_bidder(uuid)`
   - `finalize_auction_outcome(uuid)`
   - `close_auction(uuid)`

3. **URL Parameters**
   - Listing detail pages (`/listings/[id]`)
   - Category filters
   - Sort parameters

### Test Categories

- **Basic Detection**: Single quotes, semicolons, comments
- **Boolean-based Blind**: Logic manipulation attempts
- **Union-based**: Data extraction attempts
- **Time-based Blind**: Response time analysis
- **Error-based**: Information disclosure through errors
- **PostgreSQL-specific**: Database-specific injection techniques

## 🛡️ Expected Security Posture

ByeBuy should be **highly resistant** to SQL injection due to:

### Defense Layers

1. **Supabase Client**: Automatic query parameterization
2. **PostgREST**: Converts query builder calls to safe SQL
3. **PostgreSQL**: Strong typing and parameter validation
4. **Row Level Security**: Database-level access controls
5. **Next.js**: Client-side input validation

### Why Traditional SQL Injection Should Fail

```javascript
// ByeBuy's secure approach
const { data } = await supabase
  .from('listings')
  .select('*')
  .ilike('title', `%${userInput}%`);  // Automatically parameterized

// This becomes: SELECT * FROM listings WHERE title ILIKE $1
// Where $1 = '%userInput%' (safely escaped)
```

## 📊 Interpreting Results

### Result Categories

- ✅ **SAFE**: No SQL injection indicators detected
- ⚠️ **SUSPICIOUS**: Patterns requiring investigation
- ❌ **VULNERABLE**: Clear SQL injection vulnerability

### What to Look For

#### 🚨 High Priority (Immediate Action)
- SQL error messages in responses
- Database version/schema information disclosure
- Successful union queries returning unexpected data
- Evidence of stacked query execution

#### ⚠️ Medium Priority (Investigation Needed)
- Unusual response times (>5 seconds with sleep payloads)
- Different response patterns with boolean payloads
- HTTP 500 errors triggered by specific payloads

#### ℹ️ Low Priority (Monitor)
- Minor response variations
- Rate limiting activation
- Client-side validation errors

## 🔧 Manual Testing Examples

### Basic Command Line Tests

```bash
# Test search functionality
curl "https://byebuy.in/listings?search=test'"
curl "https://byebuy.in/listings?search=test' OR '1'='1"
curl "https://byebuy.in/listings?search=test'; DROP TABLE users; --"

# Test listing detail
curl "https://byebuy.in/listings/'; SELECT version()--"

# Time-based testing
time curl "https://byebuy.in/listings?search=test'; SELECT pg_sleep(5)--"
```

### Browser Console Tests

```javascript
// Test RPC functions (requires authentication)
supabase.rpc('get_distinct_listing_ids_for_bidder', {
  p_bidder_id: "'; DROP TABLE users; --"
});

supabase.rpc('finalize_auction_outcome', {
  auction_id_to_close: "' UNION SELECT version()--"
});
```

## 📈 Continuous Integration

### GitHub Actions Integration

```yaml
# .github/workflows/security-test.yml
name: Security Tests
on: [push, pull_request]

jobs:
  sql-injection-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      - name: Run SQL Injection Tests
        run: npm run security:sql-injection
```

### Automated Reporting

The test suite generates detailed JSON reports:

```json
{
  "summary": {
    "testDate": "2024-01-15T10:30:00.000Z",
    "totalTests": 45,
    "passed": 43,
    "failed": 0,
    "suspicious": 2,
    "overallStatus": "NEEDS_REVIEW"
  },
  "vulnerabilities": [],
  "suspicious": [...],
  "recommendations": [...]
}
```

## 🛠️ Customization

### Adding New Test Endpoints

```javascript
// In sql-injection-test-suite.js
const TEST_ENDPOINTS = [
  // ... existing endpoints
  {
    name: 'New Feature',
    path: '/api/new-feature',
    method: 'POST',
    params: { param: 'PAYLOAD' },
    description: 'Description of new feature',
    critical: true
  }
];
```

### Custom Payloads

```javascript
// Add new payload categories
const SQL_INJECTION_PAYLOADS = {
  // ... existing payloads
  custom: [
    "custom payload 1",
    "custom payload 2"
  ]
};
```

## 🎓 Educational Value

This testing framework serves as:

1. **Learning Tool**: Demonstrates OWASP WSTG methodology
2. **Security Assessment**: Validates application security posture
3. **Documentation**: Shows why Supabase architecture is secure
4. **Best Practices**: Examples of secure vs. vulnerable code

## 📚 Additional Resources

### OWASP Resources
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)

### Supabase Security
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Database Functions](https://supabase.com/docs/guides/database/functions)
- [Security Best Practices](https://supabase.com/docs/guides/auth/auth-helpers/nextjs)

### PostgreSQL Security
- [PostgreSQL Security](https://www.postgresql.org/docs/current/security.html)
- [PostgREST Security](https://postgrest.org/en/stable/auth.html)

## ⚠️ Important Notes

### Ethical Testing
- Only test systems you own or have explicit permission to test
- Follow responsible disclosure practices
- Respect rate limits and server resources
- Document all testing activities

### Legal Considerations
- Ensure compliance with applicable laws and regulations
- Obtain proper authorization before testing production systems
- Maintain audit trails of security testing activities

### Limitations
- This framework tests for SQL injection specifically
- Other security vulnerabilities require separate testing
- Results should be validated by security professionals
- False positives may occur and require investigation

## 🤝 Contributing

To improve this testing framework:

1. Fork the repository
2. Add new test cases or payloads
3. Improve detection algorithms
4. Enhance reporting capabilities
5. Submit pull requests with detailed descriptions

## 📞 Support

For questions about this testing framework:

1. Review the comprehensive guide: `SQL_INJECTION_TESTING_GUIDE.md`
2. Run the demonstration: `node demo-sql-injection-test.js`
3. Check the OWASP Testing Guide for methodology details
4. Consult Supabase documentation for architecture questions

---

**Remember**: Security is an ongoing process. Regular testing, code reviews, and staying updated with security best practices are essential for maintaining a secure application. 