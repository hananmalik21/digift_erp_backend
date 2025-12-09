import { executeQuery, getConnection } from '../../config/db.js';
import oracledb from 'oracledb';

/**
 * Function Privilege Model - Database operations for SEC.FUNCTION_PRIVILEGES table
 */
export class FunctionPrivilegeModel {
  /**
   * Get all function privileges with pagination and search
   * @param {number} page - Page number (1-based)
   * @param {number} limit - Number of records per page
   * @param {Object} searchParams - Search parameters
   * @param {number} searchParams.privilegeId - Filter by PRIVILEGE_ID
   * @param {string} searchParams.privilegeCode - Search PRIVILEGE_CODE (partial match)
   * @param {string} searchParams.privilegeName - Search PRIVILEGE_NAME (partial match)
   * @param {number} searchParams.moduleId - Filter by MODULE_ID
   * @param {number} searchParams.functionId - Filter by FUNCTION_ID
   * @param {number} searchParams.operationId - Filter by OPERATION_ID
   * @param {string} searchParams.status - Filter by STATUS
   * @returns {Promise<Object>} - Object containing data, total count, and pagination info
   */
  static async getAll(page = 1, limit = 10, searchParams = {}) {
    const offset = (page - 1) * limit;
    
    // Build WHERE clause and bind variables
    const conditions = [];
    const searchBinds = {};
    
    if (searchParams.privilegeId !== undefined && searchParams.privilegeId !== null) {
      const privilegeId = parseInt(searchParams.privilegeId);
      if (!isNaN(privilegeId)) {
        conditions.push('FP.PRIVILEGE_ID = :privilegeId');
        searchBinds.privilegeId = privilegeId;
      }
    }
    
    if (searchParams.privilegeCode) {
      conditions.push('UPPER(FP.PRIVILEGE_CODE) LIKE UPPER(:privilegeCode)');
      searchBinds.privilegeCode = `%${searchParams.privilegeCode}%`;
    }
    
    if (searchParams.privilegeName) {
      conditions.push('UPPER(FP.PRIVILEGE_NAME) LIKE UPPER(:privilegeName)');
      searchBinds.privilegeName = `%${searchParams.privilegeName}%`;
    }
    
    if (searchParams.moduleId !== undefined && searchParams.moduleId !== null) {
      const moduleId = parseInt(searchParams.moduleId);
      if (!isNaN(moduleId)) {
        conditions.push('FP.MODULE_ID = :moduleId');
        searchBinds.moduleId = moduleId;
      }
    }
    
    if (searchParams.functionId !== undefined && searchParams.functionId !== null) {
      const functionId = parseInt(searchParams.functionId);
      if (!isNaN(functionId)) {
        conditions.push('FP.FUNCTION_ID = :functionId');
        searchBinds.functionId = functionId;
      }
    }
    
    if (searchParams.operationId !== undefined && searchParams.operationId !== null) {
      const operationId = parseInt(searchParams.operationId);
      if (!isNaN(operationId)) {
        conditions.push('FP.OPERATION_ID = :operationId');
        searchBinds.operationId = operationId;
      }
    }
    
    if (searchParams.status) {
      conditions.push('UPPER(FP.STATUS) = UPPER(:status)');
      searchBinds.status = searchParams.status.toUpperCase();
    }
    
    // General search parameter - searches across privilege name, code, description, and function name
    if (searchParams.search) {
      const searchConditions = [
        'UPPER(FP.PRIVILEGE_NAME) LIKE UPPER(:search)',
        'UPPER(FP.PRIVILEGE_CODE) LIKE UPPER(:search)',
        'UPPER(FP.DESCRIPTION) LIKE UPPER(:search)',
        'UPPER(F.FUNCTION_NAME) LIKE UPPER(:search)'
      ];
      conditions.push(`(${searchConditions.join(' OR ')})`);
      searchBinds.search = `%${searchParams.search}%`;
    }
    
    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}` 
      : '';
    
    // Get total count (only use search binds, no pagination binds)
    // Need to include JOINs for search to work on function name
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM SEC.FUNCTION_PRIVILEGES FP
      LEFT JOIN SEC.MODULES M ON FP.MODULE_ID = M.MODULE_ID
      LEFT JOIN SEC.FUNCTIONS F ON FP.FUNCTION_ID = F.FUNCTION_ID
      LEFT JOIN SEC.OPERATIONS O ON FP.OPERATION_ID = O.OPERATION_ID
      ${whereClause}
    `;
    const countResult = await executeQuery(countQuery, searchBinds);
    const total = countResult.rows[0].TOTAL;
    
    // Get activity counts (total active and inactive) - using same search filters but excluding status
    // Need to handle search condition which is already grouped with OR
    const activityConditions = conditions.filter(c => !c.includes('STATUS'));
    const activityWhereClause = activityConditions.length > 0 
      ? `WHERE ${activityConditions.join(' AND ')}` 
      : '';
    
    const activeConditions = [...activityConditions];
    activeConditions.push('UPPER(FP.STATUS) = UPPER(:statusActive)');
    const activeWhereClause = activeConditions.length > 0 
      ? `WHERE ${activeConditions.join(' AND ')}` 
      : '';
    
    const inactiveConditions = [...activityConditions];
    inactiveConditions.push('UPPER(FP.STATUS) = UPPER(:statusInactive)');
    const inactiveWhereClause = inactiveConditions.length > 0 
      ? `WHERE ${inactiveConditions.join(' AND ')}` 
      : '';
    
    const activeBindParams = { ...searchBinds };
    delete activeBindParams.status;
    activeBindParams.statusActive = 'ACTIVE';
    
    const inactiveBindParams = { ...searchBinds };
    delete inactiveBindParams.status;
    inactiveBindParams.statusInactive = 'INACTIVE';
    
    const activeCountQuery = `
      SELECT COUNT(*) as total_active 
      FROM SEC.FUNCTION_PRIVILEGES FP
      LEFT JOIN SEC.MODULES M ON FP.MODULE_ID = M.MODULE_ID
      LEFT JOIN SEC.FUNCTIONS F ON FP.FUNCTION_ID = F.FUNCTION_ID
      LEFT JOIN SEC.OPERATIONS O ON FP.OPERATION_ID = O.OPERATION_ID
      ${activeWhereClause}
    `;
    const inactiveCountQuery = `
      SELECT COUNT(*) as total_inactive 
      FROM SEC.FUNCTION_PRIVILEGES FP
      LEFT JOIN SEC.MODULES M ON FP.MODULE_ID = M.MODULE_ID
      LEFT JOIN SEC.FUNCTIONS F ON FP.FUNCTION_ID = F.FUNCTION_ID
      LEFT JOIN SEC.OPERATIONS O ON FP.OPERATION_ID = O.OPERATION_ID
      ${inactiveWhereClause}
    `;
    
    const activeCountResult = await executeQuery(activeCountQuery, activeBindParams);
    const inactiveCountResult = await executeQuery(inactiveCountQuery, inactiveBindParams);
    
    const totalActive = activeCountResult.rows[0].TOTAL_ACTIVE;
    const totalInactive = inactiveCountResult.rows[0].TOTAL_INACTIVE;
    
    // Get paginated data (combine search binds with pagination binds)
    const dataBinds = { ...searchBinds, offset, limit };
    const dataQuery = `
      SELECT 
        FP.PRIVILEGE_ID,
        FP.PRIVILEGE_CODE,
        FP.PRIVILEGE_NAME,
        FP.DESCRIPTION,
        FP.MODULE_ID,
        M.MODULE_NAME,
        FP.FUNCTION_ID,
        F.FUNCTION_NAME,
        FP.OPERATION_ID,
        O.OPERATION_NAME,
        FP.STATUS,
        FP.CREATED_AT,
        FP.CREATED_BY,
        FP.UPDATED_AT,
        FP.UPDATED_BY
      FROM SEC.FUNCTION_PRIVILEGES FP
      LEFT JOIN SEC.MODULES M ON FP.MODULE_ID = M.MODULE_ID
      LEFT JOIN SEC.FUNCTIONS F ON FP.FUNCTION_ID = F.FUNCTION_ID
      LEFT JOIN SEC.OPERATIONS O ON FP.OPERATION_ID = O.OPERATION_ID
      ${whereClause}
      ORDER BY FP.PRIVILEGE_ID 
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
    `;
    const dataResult = await executeQuery(dataQuery, dataBinds);
    
    return {
      data: dataResult.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      activity: {
        total_active_value: totalActive,
        total_inactive_value: totalInactive
      }
    };
  }

  /**
   * Get function privilege by ID
   * @param {number} privilegeId - Privilege ID
   * @returns {Promise<Object|null>} - Function privilege object or null if not found
   */
  static async getById(privilegeId) {
    const result = await executeQuery(
      `SELECT 
        FP.PRIVILEGE_ID,
        FP.PRIVILEGE_CODE,
        FP.PRIVILEGE_NAME,
        FP.DESCRIPTION,
        FP.MODULE_ID,
        M.MODULE_NAME,
        FP.FUNCTION_ID,
        F.FUNCTION_NAME,
        FP.OPERATION_ID,
        O.OPERATION_NAME,
        FP.STATUS,
        FP.CREATED_AT,
        FP.CREATED_BY,
        FP.UPDATED_AT,
        FP.UPDATED_BY
      FROM SEC.FUNCTION_PRIVILEGES FP
      LEFT JOIN SEC.MODULES M ON FP.MODULE_ID = M.MODULE_ID
      LEFT JOIN SEC.FUNCTIONS F ON FP.FUNCTION_ID = F.FUNCTION_ID
      LEFT JOIN SEC.OPERATIONS O ON FP.OPERATION_ID = O.OPERATION_ID
      WHERE FP.PRIVILEGE_ID = :privilegeId`,
      { privilegeId }
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Create a new function privilege
   * @param {Object} privilegeData - Function privilege data
   * @param {string} privilegeData.privilegeCode - Privilege code
   * @param {string} privilegeData.privilegeName - Privilege name
   * @param {string} privilegeData.description - Description
   * @param {number} privilegeData.moduleId - Module ID
   * @param {number} privilegeData.functionId - Function ID
   * @param {number} privilegeData.operationId - Operation ID
   * @param {string} privilegeData.status - Status (default: 'ACTIVE')
   * @param {string} privilegeData.createdBy - Created by user (default: 'SYSTEM')
   * @returns {Promise<Object>} - Created function privilege object
   */
  static async create(privilegeData) {
    const connection = await getConnection();
    try {
      const {
        privilegeCode,
        privilegeName,
        description,
        moduleId,
        functionId,
        operationId,
        status = 'ACTIVE',
        createdBy = 'SYSTEM'
      } = privilegeData;

      // Validate required fields
      if (!privilegeCode || !privilegeName) {
        throw new Error('privilegeCode and privilegeName are required');
      }

      // Insert new function privilege
      const result = await connection.execute(
        `INSERT INTO SEC.FUNCTION_PRIVILEGES (
          PRIVILEGE_CODE,
          PRIVILEGE_NAME,
          DESCRIPTION,
          MODULE_ID,
          FUNCTION_ID,
          OPERATION_ID,
          STATUS,
          CREATED_BY,
          CREATED_AT
        ) VALUES (
          :privilegeCode,
          :privilegeName,
          :description,
          :moduleId,
          :functionId,
          :operationId,
          :status,
          :createdBy,
          SYSTIMESTAMP
        )
        RETURNING PRIVILEGE_ID INTO :privilegeId`,
        {
          privilegeCode,
          privilegeName,
          description: description || null,
          moduleId: moduleId ? parseInt(moduleId) : null,
          functionId: functionId ? parseInt(functionId) : null,
          operationId: operationId ? parseInt(operationId) : null,
          status,
          createdBy,
          privilegeId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
        },
        { autoCommit: true }
      );

      const privilegeId = result.outBinds.privilegeId[0];
      await connection.close();
      
      // Return the created function privilege
      return await this.getById(privilegeId);
    } catch (error) {
      await connection.close();
      throw error;
    }
  }

  /**
   * Update a function privilege
   * @param {number} privilegeId - Privilege ID
   * @param {Object} privilegeData - Function privilege data to update
   * @param {string} privilegeData.privilegeCode - Privilege code
   * @param {string} privilegeData.privilegeName - Privilege name
   * @param {string} privilegeData.description - Description
   * @param {number} privilegeData.moduleId - Module ID
   * @param {number} privilegeData.functionId - Function ID
   * @param {number} privilegeData.operationId - Operation ID
   * @param {string} privilegeData.status - Status
   * @param {string} privilegeData.updatedBy - Updated by user
   * @returns {Promise<Object>} - Updated function privilege object
   */
  static async update(privilegeId, privilegeData) {
    const connection = await getConnection();
    try {
      const {
        privilegeCode,
        privilegeName,
        description,
        moduleId,
        functionId,
        operationId,
        status,
        updatedBy = 'SYSTEM'
      } = privilegeData;

      // Build UPDATE SET clause dynamically based on provided fields
      const updates = [];
      const binds = { privilegeId };

      if (privilegeCode !== undefined) {
        updates.push('PRIVILEGE_CODE = :privilegeCode');
        binds.privilegeCode = privilegeCode;
      }

      if (privilegeName !== undefined) {
        updates.push('PRIVILEGE_NAME = :privilegeName');
        binds.privilegeName = privilegeName;
      }

      if (description !== undefined) {
        updates.push('DESCRIPTION = :description');
        binds.description = description;
      }

      if (moduleId !== undefined) {
        updates.push('MODULE_ID = :moduleId');
        binds.moduleId = moduleId ? parseInt(moduleId) : null;
      }

      if (functionId !== undefined) {
        updates.push('FUNCTION_ID = :functionId');
        binds.functionId = functionId ? parseInt(functionId) : null;
      }

      if (operationId !== undefined) {
        updates.push('OPERATION_ID = :operationId');
        binds.operationId = operationId ? parseInt(operationId) : null;
      }

      if (status !== undefined) {
        updates.push('STATUS = :status');
        binds.status = status;
      }

      if (updates.length === 0) {
        throw new Error('No fields to update');
      }

      // Always update UPDATED_AT and UPDATED_BY
      updates.push('UPDATED_AT = SYSTIMESTAMP');
      updates.push('UPDATED_BY = :updatedBy');
      binds.updatedBy = updatedBy;

      const updateQuery = `
        UPDATE SEC.FUNCTION_PRIVILEGES 
        SET ${updates.join(', ')}
        WHERE PRIVILEGE_ID = :privilegeId
      `;

      const result = await connection.execute(updateQuery, binds, { autoCommit: true });
      
      await connection.close();

      if (result.rowsAffected === 0) {
        return null; // Function privilege not found
      }

      // Return the updated function privilege
      return await this.getById(privilegeId);
    } catch (error) {
      await connection.close();
      throw error;
    }
  }

  /**
   * Delete a function privilege
   * @param {number} privilegeId - Privilege ID
   * @returns {Promise<boolean>} - True if deleted, false if not found
   */
  static async delete(privilegeId) {
    const connection = await getConnection();
    try {
      const result = await connection.execute(
        'DELETE FROM SEC.FUNCTION_PRIVILEGES WHERE PRIVILEGE_ID = :privilegeId',
        { privilegeId },
        { autoCommit: true }
      );

      await connection.close();
      return result.rowsAffected > 0;
    } catch (error) {
      await connection.close();
      throw error;
    }
  }
}

