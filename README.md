# Oracle Autonomous Database - Node.js Connection

This project demonstrates how to connect a Node.js application to Oracle Autonomous Database Cloud using wallet-based authentication.

## Prerequisites

1. **Node.js** (v14 or higher recommended)
2. **Oracle Instant Client** - Required for the `oracledb` package
   
   **Windows Installation:**
   1. Download Oracle Instant Client Basic Package from: https://www.oracle.com/database/technologies/instant-client/winx64-64-downloads.html
   2. Extract the ZIP file to a folder (e.g., `C:\oracle\instantclient_21_3`)
   3. Add the folder to your system PATH:
      - Open System Properties → Environment Variables
      - Edit the `Path` variable under System variables
      - Add the full path to the Instant Client folder (e.g., `C:\oracle\instantclient_21_3`)
      - Click OK and restart your terminal/command prompt
   
   **Alternative:** Set `ORACLE_CLIENT_LIB_DIR` in your `.env` file:
   ```env
   ORACLE_CLIENT_LIB_DIR=C:\oracle\instantclient_21_3
   ```
   
   **Verify Installation:**
   ```bash
   # Check if Oracle libraries are accessible
   dir C:\oracle\instantclient_21_3\oci.dll
   ```

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and provide your database credentials:
   ```env
   DB_CONNECT_STRING=testdb_high
   DB_USER=your_username
   DB_PASSWORD=your_password
   ```

## Wallet Configuration

The project uses the wallet files located in the `TESTDB` folder. The wallet contains:
- SSL certificates for secure connections
- Connection strings (tnsnames.ora)
- Network configuration (sqlnet.ora)

**Available connection strings** (from tnsnames.ora):
- `testdb_high` - High performance service
- `testdb_medium` - Medium performance service
- `testdb_low` - Low performance service
- `testdb_tp` - Transaction Processing service
- `testdb_tpurgent` - Transaction Processing Urgent service

## Usage

### Test Connection

Test your database connection:
```bash
npm run test-connection
```

### Run Application

Run the main application:
```bash
npm start
```

## Project Structure

```
.
├── config/
│   └── db.js              # Database configuration and connection utilities
├── TESTDB/                # Oracle wallet files (keep secure!)
│   ├── tnsnames.ora       # Connection strings
│   ├── sqlnet.ora         # Network configuration
│   ├── cwallet.sso        # Wallet file
│   └── ...
├── index.js               # Main application entry point
├── test-connection.js     # Connection test script
├── package.json           # Node.js dependencies
└── .env                   # Environment variables (create from .env.example)
```

## Code Examples

### Basic Query

```javascript
import { executeQuery } from './config/db.js';

const result = await executeQuery('SELECT * FROM your_table WHERE id = :id', [123]);
console.log(result.rows);
```

### Using Connection Pool

```javascript
import { getConnection, closePool } from './config/db.js';

const connection = await getConnection();
try {
  const result = await connection.execute('SELECT * FROM dual');
  console.log(result.rows);
} finally {
  await connection.close();
}
```

### Transaction Example

```javascript
import { getConnection } from './config/db.js';

const connection = await getConnection();
try {
  await connection.execute('INSERT INTO table1 VALUES (:1)', ['value1']);
  await connection.execute('INSERT INTO table2 VALUES (:1)', ['value2']);
  await connection.commit();
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.close();
}
```

## Troubleshooting

### Error: "NJS-045: cannot load the oracledb add-on"

**Solution:** Install Oracle Instant Client and ensure it's in your system PATH.

### Error: "ORA-12154: TNS:could not resolve the connect identifier"

**Solution:** 
- Verify `DB_CONNECT_STRING` matches an entry in `TESTDB/tnsnames.ora`
- Ensure `TESTDB` folder path is correct
- Check that `TNS_ADMIN` environment variable is set correctly

### Error: "ORA-01017: invalid username/password"

**Solution:** Verify your `DB_USER` and `DB_PASSWORD` in `.env` file are correct.

### SSL/TLS Connection Issues

**Solution:** Ensure wallet files are not corrupted and SSL certificates are valid (check README in TESTDB folder for expiry date).

## Security Notes

- **Never commit** `.env` file or wallet files to version control
- Keep wallet files secure and limit access
- Use environment variables for all sensitive credentials
- Regularly update wallet files before SSL certificate expiration

## Resources

- [Oracle Node.js Driver Documentation](https://oracle.github.io/node-oracledb/)
- [Oracle Autonomous Database Documentation](https://docs.oracle.com/en/cloud/paas/autonomous-database/)
- [Database Actions](https://G3EF73BADDAF774-TESTDB.adb.eu-frankfurt-1.oraclecloudapps.com/ords/sql-developer)

## License

ISC

