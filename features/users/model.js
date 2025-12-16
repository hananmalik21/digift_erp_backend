import { executeQuery, getConnection } from '../../config/db.js';
import oracledb from 'oracledb';
import bcrypt from 'bcrypt';
import { JobRoleModel } from '../job-roles/model.js';

/**
 * User Model - Database operations for SEC.USERS, SEC.USER_PERSONAL_INFO, and SEC.USER_ADDITIONAL_INFO tables
 */
export class UserModel {
  /**
   * Decode job roles from database format to array of job role objects
   * @param {string|Array} encodedJobRoles - Encoded job roles from database
   * @returns {Promise<Array>} - Array of job role objects
   */
  static async decodeJobRoles(encodedJobRoles) {
    if (!encodedJobRoles) {
      return [];
    }

    try {
      let value = encodedJobRoles;

      // If it's a string, try JSON parse first
      if (typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch (e) {
          // Not JSON → maybe "1,2,3"
          const idList = value
            .split(',')
            .map((id) => parseInt(id.trim(), 10))
            .filter((id) => !isNaN(id));

          if (idList.length === 0) return [];

          const jobRoles = await Promise.all(
            idList.map((id) => JobRoleModel.getById(id))
          );
          return jobRoles.filter((jr) => jr != null);
        }
      }

      // If it's already an array of full objects → just return as-is
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && !Array.isArray(value[0])) {
        return value;
      }

      // If it's an array (of IDs or ID-strings)
      if (Array.isArray(value)) {
        const idList = value
          .map((v) =>
            typeof v === 'number'
              ? v
              : parseInt(v, 10)
          )
          .filter((id) => !isNaN(id));

        if (idList.length === 0) return [];

        const jobRoles = await Promise.all(
          idList.map((id) => JobRoleModel.getById(id))
        );
        return jobRoles.filter((jr) => jr != null);
      }

      // Anything else → unsupported format
      console.error('Unsupported JOB_ROLES format:', encodedJobRoles);
      return [];
    } catch (error) {
      console.error('Error decoding job roles:', error, 'value=', encodedJobRoles);
      return [];
    }
  }

  /**
   * Encode job roles array to database format
   * @param {Array} jobRoles - Array of job role IDs or job role objects
   * @returns {string} - Encoded string (JSON array of IDs)
   */
  static encodeJobRoles(jobRoles) {
    if (!jobRoles || !Array.isArray(jobRoles) || jobRoles.length === 0) {
      return null;
    }

    // Extract IDs from array (handle both ID numbers and objects with job_role_id)
    const jobRoleIds = jobRoles.map(jr => {
      if (typeof jr === 'number') {
        return jr;
      } else if (jr && typeof jr === 'object') {
        return jr.job_role_id || jr.JOB_ROLE_ID || jr.jobRoleId || jr.id;
      }
      return parseInt(jr, 10);
    }).filter(id => id !== null && !isNaN(id));

    // Return as JSON string
    return jobRoleIds.length > 0 ? JSON.stringify(jobRoleIds) : null;
  }
  /**
   * Get all users with pagination and search
   * @param {number} page - Page number (1-based)
   * @param {number} limit - Number of records per page
   * @param {Object} searchParams - Search parameters
   * @param {number} searchParams.userId - Filter by USER_ID
   * @param {string} searchParams.username - Search USERNAME (partial match)
   * @param {string} searchParams.emailAddress - Search EMAIL_ADDRESS (partial match)
   * @param {string} searchParams.accountStatus - Filter by ACCOUNT_STATUS
   * @param {string} searchParams.accountType - Filter by ACCOUNT_TYPE
   * @param {string} searchParams.search - General search across username, email, employee number, display name, first name, last name
   * @returns {Promise<Object>} - Object containing data, total count, and pagination info
   */
  static async getAll(page = 1, limit = 10, searchParams = {}) {
    const offset = (page - 1) * limit;
    
    // Build WHERE clause and bind variables
    const conditions = [];
    const searchBinds = {};
    
    if (searchParams.userId !== undefined && searchParams.userId !== null) {
      const userId = parseInt(searchParams.userId);
      if (!isNaN(userId)) {
        conditions.push('U.USER_ID = :userId');
        searchBinds.userId = userId;
      }
    }
    
    if (searchParams.username) {
      conditions.push('UPPER(U.USERNAME) LIKE UPPER(:username)');
      searchBinds.username = `%${searchParams.username}%`;
    }
    
    if (searchParams.emailAddress) {
      conditions.push('UPPER(U.EMAIL_ADDRESS) LIKE UPPER(:emailAddress)');
      searchBinds.emailAddress = `%${searchParams.emailAddress}%`;
    }
    
    if (searchParams.accountStatus) {
      conditions.push('UPPER(U.ACCOUNT_STATUS) = UPPER(:accountStatus)');
      searchBinds.accountStatus = searchParams.accountStatus.toUpperCase();
    }
    
    if (searchParams.accountType) {
      conditions.push('UPPER(U.ACCOUNT_TYPE) = UPPER(:accountType)');
      searchBinds.accountType = searchParams.accountType.toUpperCase();
    }
    
    // General search parameter - searches across username, email, employee number, display name, first name, last name
    if (searchParams.search) {
      const searchConditions = [
        'UPPER(U.USERNAME) LIKE UPPER(:search)',
        'UPPER(U.EMAIL_ADDRESS) LIKE UPPER(:search)',
        'UPPER(UAI.EMPLOYEE_NUMBER) LIKE UPPER(:search)',
        'UPPER(UPI.DISPLAY_NAME) LIKE UPPER(:search)',
        'UPPER(UPI.FIRST_NAME) LIKE UPPER(:search)',
        'UPPER(UPI.LAST_NAME) LIKE UPPER(:search)'
      ];
      conditions.push(`(${searchConditions.join(' OR ')})`);
      searchBinds.search = `%${searchParams.search}%`;
    }
    
    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}` 
      : '';
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM SEC.USERS U
      LEFT JOIN SEC.USER_PERSONAL_INFO UPI ON U.USER_ID = UPI.USER_ID
      LEFT JOIN SEC.USER_ADDITIONAL_INFO UAI ON U.USER_ID = UAI.USER_ID
      ${whereClause}
    `;
    const countResult = await executeQuery(countQuery, searchBinds);
    const total = countResult.rows[0].TOTAL;
    
    // Calculate pagination
    const totalPages = Math.ceil(total / limit);
    
    // Get activity counts (total active and inactive accounts)
    const activityConditions = conditions.filter(c => !c.includes('ACCOUNT_STATUS'));
    const activityWhereClause = activityConditions.length > 0 
      ? `WHERE ${activityConditions.join(' AND ')}` 
      : '';
    
    const activeConditions = [...activityConditions];
    activeConditions.push('UPPER(U.ACCOUNT_STATUS) = UPPER(:statusActive)');
    const activeWhereClause = activeConditions.length > 0 
      ? `WHERE ${activeConditions.join(' AND ')}` 
      : '';
    
    const inactiveConditions = [...activityConditions];
    inactiveConditions.push('UPPER(U.ACCOUNT_STATUS) = UPPER(:statusInactive)');
    const inactiveWhereClause = inactiveConditions.length > 0 
      ? `WHERE ${inactiveConditions.join(' AND ')}` 
      : '';
    
    const activeBindParams = { ...searchBinds };
    delete activeBindParams.accountStatus;
    activeBindParams.statusActive = 'ACTIVE';
    
    const inactiveBindParams = { ...searchBinds };
    delete inactiveBindParams.accountStatus;
    inactiveBindParams.statusInactive = 'INACTIVE';
    
    const activeCountQuery = `
      SELECT COUNT(*) as total_active 
      FROM SEC.USERS U
      LEFT JOIN SEC.USER_PERSONAL_INFO UPI ON U.USER_ID = UPI.USER_ID
      LEFT JOIN SEC.USER_ADDITIONAL_INFO UAI ON U.USER_ID = UAI.USER_ID
      ${activeWhereClause}
    `;
    const inactiveCountQuery = `
      SELECT COUNT(*) as total_inactive 
      FROM SEC.USERS U
      LEFT JOIN SEC.USER_PERSONAL_INFO UPI ON U.USER_ID = UPI.USER_ID
      LEFT JOIN SEC.USER_ADDITIONAL_INFO UAI ON U.USER_ID = UAI.USER_ID
      ${inactiveWhereClause}
    `;
    
    const activeCountResult = await executeQuery(activeCountQuery, activeBindParams);
    const inactiveCountResult = await executeQuery(inactiveCountQuery, inactiveBindParams);
    
    const totalActive = activeCountResult.rows[0].TOTAL_ACTIVE;
    const totalInactive = inactiveCountResult.rows[0].TOTAL_INACTIVE;
    
    // Get paginated data
    const dataBinds = { ...searchBinds, offset, limit };
    const dataQuery = `
      SELECT 
        U.USER_ID,
        U.USERNAME,
        U.EMAIL_ADDRESS,
        U.PASSWORD_HASH,
        U.ACCOUNT_TYPE,
        U.ACCOUNT_STATUS,
        U.START_DATE,
        U.END_DATE,
        U.MUST_CHANGE_PWD_FLAG,
        U.PWD_NEVER_EXPIRES_FLAG,
        U.MFA_ENABLED_FLAG,
        U.PREFERRED_LANGUAGE,
        U.TIMEZONE_CODE,
        U.DATE_FORMAT,
        U.CREATION_DATE,
        U.CREATED_BY,
        U.LAST_UPDATE_DATE,
        U.LAST_UPDATED_BY,
        U.JOB_ROLES,
        UPI.USER_PERSONAL_ID,
        UPI.LAST_NAME,
        UPI.DISPLAY_NAME,
        UPI.FIRST_NAME,
        UPI.MIDDLE_NAME,
        UAI.USER_ADDITIONAL_ID,
        UAI.EMPLOYEE_NUMBER,
        UAI.DEPARTMENT_NAME,
        UAI.JOB_TITLE,
        UAI.PHONE_NUMBER,
        UAI.MANAGER_EMAIL,
        UAI.DESCRIPTION_NOTES
      FROM SEC.USERS U
      LEFT JOIN SEC.USER_PERSONAL_INFO UPI ON U.USER_ID = UPI.USER_ID
      LEFT JOIN SEC.USER_ADDITIONAL_INFO UAI ON U.USER_ID = UAI.USER_ID
      ${whereClause}
      ORDER BY U.USER_ID DESC
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
    `;
    const dataResult = await executeQuery(dataQuery, dataBinds);
    
    // Decode job roles for each record
    const dataWithDecoded = await Promise.all(
      dataResult.rows.map(async (row) => {
        const decodedJobRoles = await this.decodeJobRoles(row.JOB_ROLES);
        return {
          ...row,
          JOB_ROLES_DECODED: decodedJobRoles
        };
      })
    );
    
    return {
      data: dataWithDecoded,
      page,
      limit,
      total,
      totalPages,
      activity: {
        total_active_value: totalActive,
        total_inactive_value: totalInactive
      }
    };
  }

  /**
   * Get user by ID with joined data from all three tables
   * @param {number} userId - User ID
   * @returns {Promise<Object|null>} - User object or null if not found
   */
  static async getById(userId) {
    const result = await executeQuery(
      `SELECT 
        U.USER_ID,
        U.USERNAME,
        U.EMAIL_ADDRESS,
        U.PASSWORD_HASH,
        U.ACCOUNT_TYPE,
        U.ACCOUNT_STATUS,
        U.START_DATE,
        U.END_DATE,
        U.MUST_CHANGE_PWD_FLAG,
        U.PWD_NEVER_EXPIRES_FLAG,
        U.MFA_ENABLED_FLAG,
        U.PREFERRED_LANGUAGE,
        U.TIMEZONE_CODE,
        U.DATE_FORMAT,
        U.CREATION_DATE,
        U.CREATED_BY,
        U.LAST_UPDATE_DATE,
        U.LAST_UPDATED_BY,
        U.JOB_ROLES,
        UPI.USER_PERSONAL_ID,
        UPI.LAST_NAME,
        UPI.DISPLAY_NAME,
        UPI.FIRST_NAME,
        UPI.MIDDLE_NAME,
        UAI.USER_ADDITIONAL_ID,
        UAI.EMPLOYEE_NUMBER,
        UAI.DEPARTMENT_NAME,
        UAI.JOB_TITLE,
        UAI.PHONE_NUMBER,
        UAI.MANAGER_EMAIL,
        UAI.DESCRIPTION_NOTES
      FROM SEC.USERS U
      LEFT JOIN SEC.USER_PERSONAL_INFO UPI ON U.USER_ID = UPI.USER_ID
      LEFT JOIN SEC.USER_ADDITIONAL_INFO UAI ON U.USER_ID = UAI.USER_ID
      WHERE U.USER_ID = :userId`,
      { userId }
    );
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const decodedJobRoles = await this.decodeJobRoles(row.JOB_ROLES);
    
    return {
      ...row,
      JOB_ROLES_DECODED: decodedJobRoles
    };
  }

  /**
   * Generate the next unique sequential employee ID in format EMP-001, EMP-002, etc.
   * Uses transaction isolation and uniqueness checks to ensure sequential generation.
   * Note: Oracle doesn't allow FOR UPDATE with aggregate functions, so we rely on transaction isolation.
   * @param {Object} connection - Database connection (must be in a transaction)
   * @returns {Promise<string>} - Next unique sequential employee ID
   */
  static async generateNextEmployeeId(connection) {
    try {
      // Calculate maximum numeric value from employee numbers
      // Note: Cannot use FOR UPDATE with aggregate functions in Oracle (ORA-01786)
      // Transaction isolation provides necessary serialization for sequential generation
      const maxResult = await connection.execute(
        `SELECT NVL(MAX(
          CASE 
            WHEN REGEXP_LIKE(EMPLOYEE_NUMBER, '^EMP-[0-9]+$') THEN 
              TO_NUMBER(REGEXP_SUBSTR(EMPLOYEE_NUMBER, '[0-9]+'))
            WHEN REGEXP_LIKE(EMPLOYEE_NUMBER, '^EMP[0-9]+$') THEN 
              TO_NUMBER(REGEXP_SUBSTR(EMPLOYEE_NUMBER, '[0-9]+'))
            ELSE NULL
          END
        ), 0) as max_number
         FROM SEC.USER_ADDITIONAL_INFO
         WHERE EMPLOYEE_NUMBER IS NOT NULL
           AND (EMPLOYEE_NUMBER LIKE 'EMP-%' OR EMPLOYEE_NUMBER LIKE 'EMP%')`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      let nextNumber = 1;

      if (maxResult.rows.length > 0 && maxResult.rows[0].MAX_NUMBER !== null) {
        const maxNumber = maxResult.rows[0].MAX_NUMBER;
        if (typeof maxNumber === 'number' && !isNaN(maxNumber) && maxNumber >= 0) {
          nextNumber = maxNumber + 1;
        }
      }

      // Ensure the number doesn't exceed 3 digits (EMP-999 max)
      if (nextNumber > 999) {
        throw new Error('Maximum employee number limit reached (EMP-999)');
      }

      // Generate the employee ID in EMP-XXX format
      const candidateId = `EMP-${nextNumber.toString().padStart(3, '0')}`;
      
      // Verify uniqueness - transaction isolation provides protection, this is additional safety
      const verifyResult = await connection.execute(
        `SELECT COUNT(*) as count
         FROM SEC.USER_ADDITIONAL_INFO
         WHERE EMPLOYEE_NUMBER = :employeeNumber`,
        { employeeNumber: candidateId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (verifyResult.rows[0].COUNT > 0) {
        // If it exists (shouldn't happen with FOR UPDATE, but handle it), find next available
        let attempts = 0;
        while (attempts < 100 && nextNumber <= 999) {
          nextNumber++;
          const nextCandidate = `EMP-${nextNumber.toString().padStart(3, '0')}`;
          
          const checkResult = await connection.execute(
            `SELECT COUNT(*) as count
             FROM SEC.USER_ADDITIONAL_INFO
             WHERE EMPLOYEE_NUMBER = :employeeNumber`,
            { employeeNumber: nextCandidate },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          
          if (checkResult.rows[0].COUNT === 0) {
            return nextCandidate;
          }
          attempts++;
        }
        throw new Error('Unable to generate unique employee ID - all numbers in use');
      }

      return candidateId;
    } catch (error) {
      // If query fails, handle gracefully
      console.error('Error generating employee ID:', error.message);
      
      // Only try fallback if it's not a business logic error
      if (!error.message.includes('limit reached') && !error.message.includes('all numbers')) {
        try {
          const checkResult = await connection.execute(
            `SELECT COUNT(*) as count
             FROM SEC.USER_ADDITIONAL_INFO
             WHERE EMPLOYEE_NUMBER = 'EMP-001'`,
            {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );

          if (checkResult.rows[0].COUNT === 0) {
            return 'EMP-001';
          }
        } catch (fallbackError) {
          console.error('Fallback check failed:', fallbackError.message);
        }
      }
      
      // Re-throw the error
      throw error;
    }
  }

  /**
   * Create a new user account across three tables in a single transaction
   * @param {Object} accountData - Account data
   * @param {string} accountData.username - Username (required)
   * @param {string} accountData.emailAddress - Email address (required)
   * @param {string} accountData.password - Plain password (required, will be hashed)
   * @param {string} accountData.accountType - Account type
   * @param {string} accountData.accountStatus - Account status (default: 'ACTIVE')
   * @param {Date} accountData.startDate - Start date
   * @param {Date} accountData.endDate - End date
   * @param {string} accountData.mustChangePwdFlag - Must change password flag
   * @param {string} accountData.pwdNeverExpiresFlag - Password never expires flag
   * @param {string} accountData.mfaEnabledFlag - MFA enabled flag
   * @param {string} accountData.preferredLanguage - Preferred language
   * @param {string} accountData.timezoneCode - Timezone code
   * @param {string} accountData.dateFormat - Date format
   * @param {string} accountData.createdBy - Created by user (default: 'SYSTEM')
   * @param {string} accountData.lastName - Last name
   * @param {string} accountData.displayName - Display name
   * @param {string} accountData.firstName - First name
   * @param {string} accountData.middleName - Middle name
   * @param {string} accountData.employeeNumber - Employee number (IGNORED - always auto-generated on backend)
   * @param {string} accountData.departmentName - Department name
   * @param {string} accountData.jobTitle - Job title
   * @param {string} accountData.phoneNumber - Phone number
   * @param {string} accountData.managerEmail - Manager email
   * @param {string} accountData.descriptionNotes - Description notes
   * @returns {Promise<Object>} - Created user object with all three tables joined
   */
  static async createAccount(accountData) {
    const connection = await getConnection();
    try {
      const {
        username,
        emailAddress,
        password,
        accountType,
        accountStatus = 'ACTIVE',
        startDate,
        endDate,
        mustChangePwdFlag,
        pwdNeverExpiresFlag,
        mfaEnabledFlag,
        preferredLanguage,
        timezoneCode,
        dateFormat,
        createdBy = 'SYSTEM',
        lastName,
        displayName,
        firstName,
        middleName,
        employeeNumber,
        departmentName,
        jobTitle,
        phoneNumber,
        managerEmail,
        descriptionNotes,
        jobRoles
      } = accountData;

      // Validate required fields
      if (!username || !emailAddress || !password) {
        throw new Error('username, emailAddress, and password are required');
      }

      // Hash the password using bcrypt (salt rounds: 10)
      const passwordHash = await bcrypt.hash(password, 10);

      // Encode job roles if provided
      const encodedJobRoles = this.encodeJobRoles(jobRoles);

      // Convert date strings to Date objects for Oracle (or null if not provided)
      // Validate dates and convert to Date objects - Oracle driver handles Date objects properly
      let startDateObj = null;
      if (startDate) {
        const parsedStartDate = new Date(startDate);
        if (isNaN(parsedStartDate.getTime())) {
          throw new Error('Invalid startDate format');
        }
        startDateObj = parsedStartDate;
      }

      let endDateObj = null;
      if (endDate) {
        const parsedEndDate = new Date(endDate);
        if (isNaN(parsedEndDate.getTime())) {
          throw new Error('Invalid endDate format');
        }
        endDateObj = parsedEndDate;
      }

      // Always generate employee number on backend (ignore any value from frontend)
      const finalEmployeeNumber = await this.generateNextEmployeeId(connection);

      // Step 1: Insert into SEC.USERS and get USER_ID
      const userResult = await connection.execute(
        `INSERT INTO SEC.USERS (
          USERNAME,
          EMAIL_ADDRESS,
          PASSWORD_HASH,
          ACCOUNT_TYPE,
          ACCOUNT_STATUS,
          START_DATE,
          END_DATE,
          MUST_CHANGE_PWD_FLAG,
          PWD_NEVER_EXPIRES_FLAG,
          MFA_ENABLED_FLAG,
          PREFERRED_LANGUAGE,
          TIMEZONE_CODE,
          DATE_FORMAT,
          JOB_ROLES,
          CREATED_BY,
          CREATION_DATE
        ) VALUES (
          :username,
          :emailAddress,
          :passwordHash,
          :accountType,
          :accountStatus,
          :startDate,
          :endDate,
          :mustChangePwdFlag,
          :pwdNeverExpiresFlag,
          :mfaEnabledFlag,
          :preferredLanguage,
          :timezoneCode,
          :dateFormat,
          :jobRoles,
          :createdBy,
          SYSTIMESTAMP
        )
        RETURNING USER_ID INTO :userId`,
        {
          username,
          emailAddress,
          passwordHash,
          accountType: accountType || null,
          accountStatus,
          startDate: startDateObj,
          endDate: endDateObj,
          mustChangePwdFlag: mustChangePwdFlag || null,
          pwdNeverExpiresFlag: pwdNeverExpiresFlag || null,
          mfaEnabledFlag: mfaEnabledFlag || null,
          preferredLanguage: preferredLanguage || null,
          timezoneCode: timezoneCode || null,
          dateFormat: dateFormat || null,
          jobRoles: encodedJobRoles,
          createdBy,
          userId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
        },
        { autoCommit: false }
      );

      const userId = userResult.outBinds.userId[0];

      // Step 2: Insert into SEC.USER_PERSONAL_INFO (if any personal info provided)
      const hasPersonalInfo = lastName || displayName || firstName || middleName;
      if (hasPersonalInfo) {
        await connection.execute(
          `INSERT INTO SEC.USER_PERSONAL_INFO (
            USER_ID,
            LAST_NAME,
            DISPLAY_NAME,
            FIRST_NAME,
            MIDDLE_NAME,
            CREATED_BY,
            CREATION_DATE
          ) VALUES (
            :userId,
            :lastName,
            :displayName,
            :firstName,
            :middleName,
            :createdBy,
            SYSTIMESTAMP
          )`,
          {
            userId,
            lastName: lastName || null,
            displayName: displayName || null,
            firstName: firstName || null,
            middleName: middleName || null,
            createdBy
          },
          { autoCommit: false }
        );
      }

      // Step 3: Insert into SEC.USER_ADDITIONAL_INFO (always insert employee number, plus any other additional info)
      // Employee number is always generated on backend, so we always insert this record
      const hasAdditionalInfo = departmentName || jobTitle || phoneNumber || managerEmail || descriptionNotes;
      // Always insert USER_ADDITIONAL_INFO since we always generate employee number
      if (true) {
        await connection.execute(
          `INSERT INTO SEC.USER_ADDITIONAL_INFO (
            USER_ID,
            EMPLOYEE_NUMBER,
            DEPARTMENT_NAME,
            JOB_TITLE,
            PHONE_NUMBER,
            MANAGER_EMAIL,
            DESCRIPTION_NOTES,
            CREATED_BY,
            CREATION_DATE
          ) VALUES (
            :userId,
            :employeeNumber,
            :departmentName,
            :jobTitle,
            :phoneNumber,
            :managerEmail,
            :descriptionNotes,
            :createdBy,
            SYSTIMESTAMP
          )`,
          {
            userId,
            employeeNumber: finalEmployeeNumber || null,
            departmentName: departmentName || null,
            jobTitle: jobTitle || null,
            phoneNumber: phoneNumber || null,
            managerEmail: managerEmail || null,
            descriptionNotes: descriptionNotes || null,
            createdBy
          },
          { autoCommit: false }
        );
      }

      // Commit the transaction
      await connection.commit();
      await connection.close();
      
      // Return the complete user data
      return await this.getById(userId);
    } catch (error) {
      try { await connection.rollback(); } catch (_) {}
      await connection.close();
      
      // Check for unique constraint violations on employee number
      if (error.message && (
        error.message.includes('unique constraint') || 
        error.errorNum === 1 ||
        error.message.includes('EMPLOYEE_NUMBER') ||
        error.message.includes('already exists')
      )) {
        // If it's a unique constraint on employee number, provide a clearer error
        if (error.message.includes('EMPLOYEE_NUMBER') || error.message.includes('already exists')) {
          throw error; // Already has a clear message
        }
        throw new Error('Employee number already exists. Please try again.');
      }
      
      throw error;
    }
  }

  /**
   * Update a user account across three tables in a single transaction
   * @param {number} userId - User ID
   * @param {Object} accountData - Account data to update
   * @param {string} accountData.username - Username
   * @param {string} accountData.emailAddress - Email address
   * @param {string} accountData.password - Plain password (will be hashed if provided)
   * @param {string} accountData.accountType - Account type
   * @param {string} accountData.accountStatus - Account status
   * @param {Date} accountData.startDate - Start date
   * @param {Date} accountData.endDate - End date
   * @param {string} accountData.mustChangePwdFlag - Must change password flag
   * @param {string} accountData.pwdNeverExpiresFlag - Password never expires flag
   * @param {string} accountData.mfaEnabledFlag - MFA enabled flag
   * @param {string} accountData.preferredLanguage - Preferred language
   * @param {string} accountData.timezoneCode - Timezone code
   * @param {string} accountData.dateFormat - Date format
   * @param {string} accountData.updatedBy - Updated by user (default: 'SYSTEM')
   * @param {string} accountData.lastName - Last name
   * @param {string} accountData.displayName - Display name
   * @param {string} accountData.firstName - First name
   * @param {string} accountData.middleName - Middle name
   * @param {string} accountData.employeeNumber - Employee number (cannot be changed - auto-generated)
   * @param {Array} accountData.jobRoles - Array of job role IDs or job role objects
   * @param {string} accountData.departmentName - Department name
   * @param {string} accountData.jobTitle - Job title
   * @param {string} accountData.phoneNumber - Phone number
   * @param {string} accountData.managerEmail - Manager email
   * @param {string} accountData.descriptionNotes - Description notes
   * @returns {Promise<Object|null>} - Updated user object or null if not found
   */
  static async updateAccount(userId, accountData) {
    const connection = await getConnection();
    try {
      // First, check if user exists
      const existingUser = await this.getById(userId);
      if (!existingUser) {
        await connection.close();
        return null;
      }

      const {
        username,
        emailAddress,
        password,
        accountType,
        accountStatus,
        startDate,
        endDate,
        mustChangePwdFlag,
        pwdNeverExpiresFlag,
        mfaEnabledFlag,
        preferredLanguage,
        timezoneCode,
        dateFormat,
        updatedBy = 'SYSTEM',
        lastName,
        displayName,
        firstName,
        middleName,
        employeeNumber, // Ignored - cannot change employee number
        jobRoles,
        departmentName,
        jobTitle,
        phoneNumber,
        managerEmail,
        descriptionNotes
      } = accountData;

      // Hash password if provided
      let passwordHash = undefined;
      if (password) {
        passwordHash = await bcrypt.hash(password, 10);
      }

      // Convert date strings to Date objects for Oracle
      let startDateObj = undefined;
      if (startDate !== undefined) {
        if (startDate === null) {
          startDateObj = null;
        } else {
          const parsedStartDate = new Date(startDate);
          if (isNaN(parsedStartDate.getTime())) {
            throw new Error('Invalid startDate format');
          }
          startDateObj = parsedStartDate;
        }
      }

      let endDateObj = undefined;
      if (endDate !== undefined) {
        if (endDate === null) {
          endDateObj = null;
        } else {
          const parsedEndDate = new Date(endDate);
          if (isNaN(parsedEndDate.getTime())) {
            throw new Error('Invalid endDate format');
          }
          endDateObj = parsedEndDate;
        }
      }

      // Step 1: Update SEC.USERS table
      const userUpdates = [];
      const userBinds = { userId };

      if (username !== undefined) {
        userUpdates.push('USERNAME = :username');
        userBinds.username = username;
      }

      if (emailAddress !== undefined) {
        userUpdates.push('EMAIL_ADDRESS = :emailAddress');
        userBinds.emailAddress = emailAddress;
      }

      if (passwordHash !== undefined) {
        userUpdates.push('PASSWORD_HASH = :passwordHash');
        userBinds.passwordHash = passwordHash;
      }

      if (accountType !== undefined) {
        userUpdates.push('ACCOUNT_TYPE = :accountType');
        userBinds.accountType = accountType || null;
      }

      if (accountStatus !== undefined) {
        userUpdates.push('ACCOUNT_STATUS = :accountStatus');
        userBinds.accountStatus = accountStatus;
      }

      if (startDateObj !== undefined) {
        userUpdates.push('START_DATE = :startDate');
        userBinds.startDate = startDateObj;
      }

      if (endDateObj !== undefined) {
        userUpdates.push('END_DATE = :endDate');
        userBinds.endDate = endDateObj;
      }

      if (mustChangePwdFlag !== undefined) {
        userUpdates.push('MUST_CHANGE_PWD_FLAG = :mustChangePwdFlag');
        userBinds.mustChangePwdFlag = mustChangePwdFlag || null;
      }

      if (pwdNeverExpiresFlag !== undefined) {
        userUpdates.push('PWD_NEVER_EXPIRES_FLAG = :pwdNeverExpiresFlag');
        userBinds.pwdNeverExpiresFlag = pwdNeverExpiresFlag || null;
      }

      if (mfaEnabledFlag !== undefined) {
        userUpdates.push('MFA_ENABLED_FLAG = :mfaEnabledFlag');
        userBinds.mfaEnabledFlag = mfaEnabledFlag || null;
      }

      if (preferredLanguage !== undefined) {
        userUpdates.push('PREFERRED_LANGUAGE = :preferredLanguage');
        userBinds.preferredLanguage = preferredLanguage || null;
      }

      if (timezoneCode !== undefined) {
        userUpdates.push('TIMEZONE_CODE = :timezoneCode');
        userBinds.timezoneCode = timezoneCode || null;
      }

      if (dateFormat !== undefined) {
        userUpdates.push('DATE_FORMAT = :dateFormat');
        userBinds.dateFormat = dateFormat || null;
      }

      if (jobRoles !== undefined) {
        const encodedJobRoles = this.encodeJobRoles(jobRoles);
        userUpdates.push('JOB_ROLES = :jobRoles');
        userBinds.jobRoles = encodedJobRoles;
      }

      if (userUpdates.length > 0) {
        userUpdates.push('LAST_UPDATE_DATE = SYSTIMESTAMP');
        userUpdates.push('LAST_UPDATED_BY = :updatedBy');
        userBinds.updatedBy = updatedBy;

        const userUpdateQuery = `
          UPDATE SEC.USERS 
          SET ${userUpdates.join(', ')}
          WHERE USER_ID = :userId
        `;

        await connection.execute(userUpdateQuery, userBinds, { autoCommit: false });
      }

      // Step 2: Update or Insert SEC.USER_PERSONAL_INFO
      const hasPersonalInfo = lastName !== undefined || displayName !== undefined || 
                               firstName !== undefined || middleName !== undefined;

      if (hasPersonalInfo) {
        // Check if personal info record exists
        const personalInfoCheck = await connection.execute(
          `SELECT USER_PERSONAL_ID FROM SEC.USER_PERSONAL_INFO WHERE USER_ID = :userId`,
          { userId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (personalInfoCheck.rows.length > 0) {
          // Update existing record
          const personalUpdates = [];
          const personalBinds = { userId };

          if (lastName !== undefined) {
            personalUpdates.push('LAST_NAME = :lastName');
            personalBinds.lastName = lastName || null;
          }

          if (displayName !== undefined) {
            personalUpdates.push('DISPLAY_NAME = :displayName');
            personalBinds.displayName = displayName || null;
          }

          if (firstName !== undefined) {
            personalUpdates.push('FIRST_NAME = :firstName');
            personalBinds.firstName = firstName || null;
          }

          if (middleName !== undefined) {
            personalUpdates.push('MIDDLE_NAME = :middleName');
            personalBinds.middleName = middleName || null;
          }

          if (personalUpdates.length > 0) {
            personalUpdates.push('LAST_UPDATE_DATE = SYSTIMESTAMP');
            personalUpdates.push('LAST_UPDATED_BY = :updatedBy');
            personalBinds.updatedBy = updatedBy;

            await connection.execute(
              `UPDATE SEC.USER_PERSONAL_INFO 
               SET ${personalUpdates.join(', ')}
               WHERE USER_ID = :userId`,
              personalBinds,
              { autoCommit: false }
            );
          }
        } else {
          // Insert new record
          await connection.execute(
            `INSERT INTO SEC.USER_PERSONAL_INFO (
              USER_ID,
              LAST_NAME,
              DISPLAY_NAME,
              FIRST_NAME,
              MIDDLE_NAME,
              CREATED_BY,
              CREATION_DATE
            ) VALUES (
              :userId,
              :lastName,
              :displayName,
              :firstName,
              :middleName,
              :updatedBy,
              SYSTIMESTAMP
            )`,
            {
              userId,
              lastName: lastName || null,
              displayName: displayName || null,
              firstName: firstName || null,
              middleName: middleName || null,
              updatedBy
            },
            { autoCommit: false }
          );
        }
      }

      // Step 3: Update or Insert SEC.USER_ADDITIONAL_INFO
      const hasAdditionalInfo = departmentName !== undefined || jobTitle !== undefined || 
                                 phoneNumber !== undefined || managerEmail !== undefined || 
                                 descriptionNotes !== undefined;

      if (hasAdditionalInfo) {
        // Check if additional info record exists
        const additionalInfoCheck = await connection.execute(
          `SELECT USER_ADDITIONAL_ID FROM SEC.USER_ADDITIONAL_INFO WHERE USER_ID = :userId`,
          { userId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (additionalInfoCheck.rows.length > 0) {
          // Update existing record (employee number cannot be changed)
          const additionalUpdates = [];
          const additionalBinds = { userId };

          if (departmentName !== undefined) {
            additionalUpdates.push('DEPARTMENT_NAME = :departmentName');
            additionalBinds.departmentName = departmentName || null;
          }

          if (jobTitle !== undefined) {
            additionalUpdates.push('JOB_TITLE = :jobTitle');
            additionalBinds.jobTitle = jobTitle || null;
          }

          if (phoneNumber !== undefined) {
            additionalUpdates.push('PHONE_NUMBER = :phoneNumber');
            additionalBinds.phoneNumber = phoneNumber || null;
          }

          if (managerEmail !== undefined) {
            additionalUpdates.push('MANAGER_EMAIL = :managerEmail');
            additionalBinds.managerEmail = managerEmail || null;
          }

          if (descriptionNotes !== undefined) {
            additionalUpdates.push('DESCRIPTION_NOTES = :descriptionNotes');
            additionalBinds.descriptionNotes = descriptionNotes || null;
          }

          if (additionalUpdates.length > 0) {
            additionalUpdates.push('LAST_UPDATE_DATE = SYSTIMESTAMP');
            additionalUpdates.push('LAST_UPDATED_BY = :updatedBy');
            additionalBinds.updatedBy = updatedBy;

            await connection.execute(
              `UPDATE SEC.USER_ADDITIONAL_INFO 
               SET ${additionalUpdates.join(', ')}
               WHERE USER_ID = :userId`,
              additionalBinds,
              { autoCommit: false }
            );
          }
        } else {
          // Insert new record (employee number will be auto-generated if not exists)
          const employeeNum = existingUser.EMPLOYEE_NUMBER || await this.generateNextEmployeeId(connection);
          
          await connection.execute(
            `INSERT INTO SEC.USER_ADDITIONAL_INFO (
              USER_ID,
              EMPLOYEE_NUMBER,
              DEPARTMENT_NAME,
              JOB_TITLE,
              PHONE_NUMBER,
              MANAGER_EMAIL,
              DESCRIPTION_NOTES,
              CREATED_BY,
              CREATION_DATE
            ) VALUES (
              :userId,
              :employeeNumber,
              :departmentName,
              :jobTitle,
              :phoneNumber,
              :managerEmail,
              :descriptionNotes,
              :updatedBy,
              SYSTIMESTAMP
            )`,
            {
              userId,
              employeeNumber: employeeNum,
              departmentName: departmentName || null,
              jobTitle: jobTitle || null,
              phoneNumber: phoneNumber || null,
              managerEmail: managerEmail || null,
              descriptionNotes: descriptionNotes || null,
              updatedBy
            },
            { autoCommit: false }
          );
        }
      }

      // Commit the transaction
      await connection.commit();
      await connection.close();
      
      // Return the updated user data
      return await this.getById(userId);
    } catch (error) {
      try { await connection.rollback(); } catch (_) {}
      await connection.close();
      
      // Check for unique constraint violations
      if (error.message && (
        error.message.includes('unique constraint') || 
        error.errorNum === 1 ||
        error.message.includes('USERNAME') ||
        error.message.includes('EMAIL')
      )) {
        let errorMessage = 'Username or email already exists';
        if (error.message.includes('USERNAME')) {
          errorMessage = 'Username already exists';
        } else if (error.message.includes('EMAIL')) {
          errorMessage = 'Email address already exists';
        }
        throw new Error(errorMessage);
      }
      
      throw error;
    }
  }

  /**
   * Delete a user account (deletes from all 3 tables in a transaction)
   * @param {number} userId - User ID
   * @returns {Promise<boolean>} - True if deleted, false if not found
   */
  static async deleteAccount(userId) {
    const connection = await getConnection();
    try {
      // First check if user exists
      const existingUser = await this.getById(userId);
      if (!existingUser) {
        await connection.close();
        return false;
      }

      // Delete from all 3 tables in reverse order (child tables first, then parent)
      // Step 1: Delete from USER_ADDITIONAL_INFO
      await connection.execute(
        'DELETE FROM SEC.USER_ADDITIONAL_INFO WHERE USER_ID = :userId',
        { userId },
        { autoCommit: false }
      );

      // Step 2: Delete from USER_PERSONAL_INFO
      await connection.execute(
        'DELETE FROM SEC.USER_PERSONAL_INFO WHERE USER_ID = :userId',
        { userId },
        { autoCommit: false }
      );

      // Step 3: Delete from USERS (parent table)
      const result = await connection.execute(
        'DELETE FROM SEC.USERS WHERE USER_ID = :userId',
        { userId },
        { autoCommit: false }
      );

      // Commit the transaction
      await connection.commit();
      await connection.close();

      return result.rowsAffected > 0;
    } catch (error) {
      try { await connection.rollback(); } catch (_) {}
      await connection.close();
      throw error;
    }
  }

  /**
   * Reset user password
   * @param {number} userId - User ID
   * @param {string} newPassword - New plain password (will be hashed)
   * @param {string} updatedBy - Updated by user (default: 'SYSTEM')
   * @returns {Promise<Object|null>} - Updated user object or null if not found
   */
  static async resetPassword(userId, newPassword, updatedBy = 'SYSTEM') {
    const connection = await getConnection();
    try {
      // Check if user exists
      const existingUser = await this.getById(userId);
      if (!existingUser) {
        await connection.close();
        return null;
      }

      // Validate password
      if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length === 0) {
        throw new Error('Password is required and cannot be empty');
      }

      // Hash the new password
      const passwordHash = await bcrypt.hash(newPassword, 10);

      // Update password in SEC.USERS table
      const result = await connection.execute(
        `UPDATE SEC.USERS 
         SET PASSWORD_HASH = :passwordHash,
             LAST_UPDATE_DATE = SYSTIMESTAMP,
             LAST_UPDATED_BY = :updatedBy
         WHERE USER_ID = :userId`,
        {
          passwordHash,
          updatedBy,
          userId
        },
        { autoCommit: true }
      );

      await connection.close();

      if (result.rowsAffected === 0) {
        return null; // User not found
      }

      // Return the updated user data
      return await this.getById(userId);
    } catch (error) {
      await connection.close();
      throw error;
    }
  }
}

