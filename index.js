import { createPool, executeQuery, closePool, getConnection } from './config/db.js';
import oracledb from 'oracledb';

/**
 * Verify database connection is working
 */
async function verifyConnection() {
  try {
    const connection = await getConnection();
    const result = await connection.execute(
      'SELECT SYSDATE as current_date, USER as current_user FROM dual',
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    await connection.close();
    return result.rows[0];
  } catch (error) {
    throw new Error(`Connection verification failed: ${error.message}`);
  }
}

/**
 * Main application entry point
 */
async function main() {
  try {
    console.log('Starting Oracle Autonomous Database Node.js application...\n');
    
    // Step 1: Check connection
    console.log('🔍 Checking database connection...');
    
    // Step 2: Create connection pool
    await createPool();
    
    // Step 3: Verify connection with a test query
    console.log('Verifying connection...');
    const connectionInfo = await verifyConnection();
    
    // Step 4: Display connection success message
    console.log('\n✅ Connection established successfully!');
    console.log('Connection Details:');
    console.log('  - Current User:', connectionInfo.CURRENT_USER);
    console.log('  - Current Date:', connectionInfo.CURRENT_DATE);
    console.log('');
    
    // Step 5: Execute the main query
    console.log('Fetching sample data...');
    const result = await executeQuery('SELECT SYSDATE as current_date, USER as current_user FROM dual');
    
    console.log('\nQuery Results:');
    console.log('Current Date:', result.rows[0].CURRENT_DATE);
    console.log('Current User:', result.rows[0].CURRENT_USER);
    
    // Example: Execute a custom query (uncomment and modify as needed)
    // const customResult = await executeQuery('SELECT * FROM your_table WHERE rownum <= 10');
    // console.log('\nCustom Query Results:', customResult.rows);
    
    // Step 6: Close pool
    await closePool();
    
    console.log('\n✅ Application completed successfully!');
  } catch (error) {
    console.error('\n❌ Connection Error:');
    if (error.message.includes('Connection verification failed') || error.message.includes('Connection')) {
      console.error('Failed to establish database connection.');
      console.error('Error:', error.message);
    } else {
      console.error('Application error:', error.message);
    }
    
    if (error.errorNum) {
      console.error('Error code:', error.errorNum);
    }
    
    await closePool();
    process.exit(1);
  }
}

// Run application
main();

