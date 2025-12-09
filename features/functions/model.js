import { executeQuery, getConnection } from '../../config/db.js';
import oracledb from 'oracledb';

/**
 * Function Model - Database operations for SEC.FUNCTIONS table
 */
export class FunctionModel {
  /**
   * Get all functions with pagination and search
   * @param {number} page - Page number (1-based)
   * @param {number} limit - Number of records per page
   * @param {Object} searchParams - Search parameters
   * @param {number} searchParams.functionId - Filter by FUNCTION_ID
   * @param {number} searchParams.moduleId - Filter by MODULE_ID
   * @param {string} searchParams.functionCode - Search FUNCTION_CODE (partial match)
   * @param {string} searchParams.functionName - Search FUNCTION_NAME (partial match)
   * @returns {Promise<Object>} - Object containing data, total count, and pagination info
   */
  static async getAll(page = 1, limit = 10, searchParams = {}) {
    const offset = (page - 1) * limit;
    
    // Build WHERE clause and bind variables
    const conditions = [];
    const searchBinds = {};
    
    if (searchParams.functionId !== undefined && searchParams.functionId !== null) {
      const functionId = parseInt(searchParams.functionId);
      if (!isNaN(functionId)) {
        conditions.push('F.FUNCTION_ID = :functionId');
        searchBinds.functionId = functionId;
      }
    }
    
    if (searchParams.moduleId !== undefined && searchParams.moduleId !== null) {
      const moduleId = parseInt(searchParams.moduleId);
      if (!isNaN(moduleId)) {
        conditions.push('F.MODULE_ID = :moduleId');
        searchBinds.moduleId = moduleId;
      }
    }
    
    if (searchParams.functionCode) {
      conditions.push('UPPER(F.FUNCTION_CODE) LIKE UPPER(:functionCode)');
      searchBinds.functionCode = `%${searchParams.functionCode}%`;
    }
    
    if (searchParams.functionName) {
      conditions.push('UPPER(F.FUNCTION_NAME) LIKE UPPER(:functionName)');
      searchBinds.functionName = `%${searchParams.functionName}%`;
    }
    
    if (searchParams.status) {
      conditions.push('UPPER(F.STATUS) = UPPER(:status)');
      searchBinds.status = searchParams.status.toUpperCase();
    }
    
    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}` 
      : '';
    
    // Get total count (only use search binds, no pagination binds)
    const countQuery = `SELECT COUNT(*) as total FROM SEC.FUNCTIONS F ${whereClause}`;
    const countResult = await executeQuery(countQuery, searchBinds);
    const total = countResult.rows[0].TOTAL;
    
    // Get activity counts (total active and inactive) - using same search filters but excluding status
    const activityConditions = conditions.filter(c => !c.includes('STATUS'));
    const activityWhereClause = activityConditions.length > 0 
      ? `WHERE ${activityConditions.join(' AND ')}` 
      : '';
    
    const activeConditions = [...activityConditions];
    activeConditions.push('UPPER(F.STATUS) = UPPER(:statusActive)');
    const activeWhereClause = activeConditions.length > 0 
      ? `WHERE ${activeConditions.join(' AND ')}` 
      : '';
    
    const inactiveConditions = [...activityConditions];
    inactiveConditions.push('UPPER(F.STATUS) = UPPER(:statusInactive)');
    const inactiveWhereClause = inactiveConditions.length > 0 
      ? `WHERE ${inactiveConditions.join(' AND ')}` 
      : '';
    
    const activeBindParams = { ...searchBinds };
    delete activeBindParams.status;
    activeBindParams.statusActive = 'ACTIVE';
    
    const inactiveBindParams = { ...searchBinds };
    delete inactiveBindParams.status;
    inactiveBindParams.statusInactive = 'INACTIVE';
    
    const activeCountQuery = `SELECT COUNT(*) as total_active FROM SEC.FUNCTIONS F ${activeWhereClause}`;
    const inactiveCountQuery = `SELECT COUNT(*) as total_inactive FROM SEC.FUNCTIONS F ${inactiveWhereClause}`;
    
    const activeCountResult = await executeQuery(activeCountQuery, activeBindParams);
    const inactiveCountResult = await executeQuery(inactiveCountQuery, inactiveBindParams);
    
    const totalActive = activeCountResult.rows[0].TOTAL_ACTIVE;
    const totalInactive = inactiveCountResult.rows[0].TOTAL_INACTIVE;
    
    // Get paginated data (combine search binds with pagination binds)
    const dataBinds = { ...searchBinds, offset, limit };
    const dataQuery = `
      SELECT 
        F.FUNCTION_ID,
        F.MODULE_ID,
        M.MODULE_NAME,
        F.FUNCTION_CODE,
        F.FUNCTION_NAME,
        F.DESCRIPTION,
        F.STATUS,
        F.CREATED_AT,
        F.CREATED_BY,
        F.UPDATED_AT,
        F.UPDATED_BY
      FROM SEC.FUNCTIONS F
      LEFT JOIN SEC.MODULES M ON F.MODULE_ID = M.MODULE_ID
      ${whereClause}
      ORDER BY F.FUNCTION_ID 
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
   * Get function by ID
   * @param {number} functionId - Function ID
   * @returns {Promise<Object|null>} - Function object or null if not found
   */
  static async getById(functionId) {
    const result = await executeQuery(
      `SELECT 
        F.FUNCTION_ID,
        F.MODULE_ID,
        M.MODULE_NAME,
        F.FUNCTION_CODE,
        F.FUNCTION_NAME,
        F.DESCRIPTION,
        F.STATUS,
        F.CREATED_AT,
        F.CREATED_BY,
        F.UPDATED_AT,
        F.UPDATED_BY
      FROM SEC.FUNCTIONS F
      LEFT JOIN SEC.MODULES M ON F.MODULE_ID = M.MODULE_ID
      WHERE F.FUNCTION_ID = :functionId`,
      { functionId }
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get functions by module ID with pagination and search
   * @param {number} moduleId - Module ID
   * @param {number} page - Page number (1-based)
   * @param {number} limit - Number of records per page
   * @param {Object} searchParams - Additional search parameters
   * @param {number} searchParams.functionId - Filter by FUNCTION_ID
   * @param {string} searchParams.functionCode - Search FUNCTION_CODE (partial match)
   * @param {string} searchParams.functionName - Search FUNCTION_NAME (partial match)
   * @returns {Promise<Object>} - Object containing data, total count, and pagination info
   */
  static async getByModuleId(moduleId, page = 1, limit = 10, searchParams = {}) {
    const offset = (page - 1) * limit;
    
    // Build WHERE clause and bind variables
    const conditions = ['F.MODULE_ID = :moduleId'];
    const searchBinds = { moduleId };
    
    if (searchParams.functionId !== undefined && searchParams.functionId !== null) {
      const functionId = parseInt(searchParams.functionId);
      if (!isNaN(functionId)) {
        conditions.push('F.FUNCTION_ID = :functionId');
        searchBinds.functionId = functionId;
      }
    }
    
    if (searchParams.functionCode) {
      conditions.push('UPPER(F.FUNCTION_CODE) LIKE UPPER(:functionCode)');
      searchBinds.functionCode = `%${searchParams.functionCode}%`;
    }
    
    if (searchParams.functionName) {
      conditions.push('UPPER(F.FUNCTION_NAME) LIKE UPPER(:functionName)');
      searchBinds.functionName = `%${searchParams.functionName}%`;
    }
    
    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM SEC.FUNCTIONS F ${whereClause}`;
    const countResult = await executeQuery(countQuery, searchBinds);
    const total = countResult.rows[0].TOTAL;
    
    // Get activity counts (total active and inactive) - using same search filters
    const activeConditions = [...conditions];
    activeConditions.push('UPPER(F.STATUS) = UPPER(:statusActive)');
    const activeWhereClause = `WHERE ${activeConditions.join(' AND ')}`;
    
    const inactiveConditions = [...conditions];
    inactiveConditions.push('UPPER(F.STATUS) = UPPER(:statusInactive)');
    const inactiveWhereClause = `WHERE ${inactiveConditions.join(' AND ')}`;
    
    const activeBindParams = { ...searchBinds };
    activeBindParams.statusActive = 'ACTIVE';
    
    const inactiveBindParams = { ...searchBinds };
    inactiveBindParams.statusInactive = 'INACTIVE';
    
    const activeCountQuery = `SELECT COUNT(*) as total_active FROM SEC.FUNCTIONS F ${activeWhereClause}`;
    const inactiveCountQuery = `SELECT COUNT(*) as total_inactive FROM SEC.FUNCTIONS F ${inactiveWhereClause}`;
    
    const activeCountResult = await executeQuery(activeCountQuery, activeBindParams);
    const inactiveCountResult = await executeQuery(inactiveCountQuery, inactiveBindParams);
    
    const totalActive = activeCountResult.rows[0].TOTAL_ACTIVE;
    const totalInactive = inactiveCountResult.rows[0].TOTAL_INACTIVE;
    
    // Get paginated data (combine search binds with pagination binds)
    const dataBinds = { ...searchBinds, offset, limit };
    const dataQuery = `
      SELECT 
        F.FUNCTION_ID,
        F.MODULE_ID,
        M.MODULE_NAME,
        F.FUNCTION_CODE,
        F.FUNCTION_NAME,
        F.DESCRIPTION,
        F.STATUS,
        F.CREATED_AT,
        F.CREATED_BY,
        F.UPDATED_AT,
        F.UPDATED_BY
      FROM SEC.FUNCTIONS F
      LEFT JOIN SEC.MODULES M ON F.MODULE_ID = M.MODULE_ID
      ${whereClause}
      ORDER BY F.FUNCTION_ID 
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
   * Create a new function
   * @param {Object} functionData - Function data
   * @param {number} functionData.moduleId - Module ID
   * @param {string} functionData.functionCode - Function code
   * @param {string} functionData.functionName - Function name
   * @param {string} functionData.description - Description
   * @param {string} functionData.status - Status (default: 'ACTIVE')
   * @param {string} functionData.createdBy - Created by user (default: 'SYSTEM')
   * @returns {Promise<Object>} - Created function object
   */
  static async create(functionData) {
    const connection = await getConnection();
    try {
      const {
        moduleId,
        functionCode,
        functionName,
        description,
        status = 'ACTIVE',
        createdBy = 'SYSTEM'
      } = functionData;

      // Validate required fields
      if (!moduleId || !functionCode || !functionName) {
        throw new Error('moduleId, functionCode, and functionName are required');
      }

      // Insert new function
      const result = await connection.execute(
        `INSERT INTO SEC.FUNCTIONS (
          MODULE_ID,
          FUNCTION_CODE,
          FUNCTION_NAME,
          DESCRIPTION,
          STATUS,
          CREATED_BY,
          CREATED_AT
        ) VALUES (
          :moduleId,
          :functionCode,
          :functionName,
          :description,
          :status,
          :createdBy,
          SYSTIMESTAMP
        )
        RETURNING FUNCTION_ID INTO :functionId`,
        {
          moduleId: parseInt(moduleId),
          functionCode,
          functionName,
          description: description || null,
          status,
          createdBy,
          functionId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
        },
        { autoCommit: true }
      );

      const functionId = result.outBinds.functionId[0];
      await connection.close();
      
      // Return the created function
      return await this.getById(functionId);
    } catch (error) {
      await connection.close();
      throw error;
    }
  }

  /**
   * Update a function
   * @param {number} functionId - Function ID
   * @param {Object} functionData - Function data to update
   * @param {number} functionData.moduleId - Module ID
   * @param {string} functionData.functionCode - Function code
   * @param {string} functionData.functionName - Function name
   * @param {string} functionData.description - Description
   * @param {string} functionData.status - Status
   * @param {string} functionData.updatedBy - Updated by user
   * @returns {Promise<Object>} - Updated function object
   */
  static async update(functionId, functionData) {
    const connection = await getConnection();
    try {
      const {
        moduleId,
        functionCode,
        functionName,
        description,
        status,
        updatedBy = 'SYSTEM'
      } = functionData;

      // Build UPDATE SET clause dynamically based on provided fields
      const updates = [];
      const binds = { functionId };

      if (moduleId !== undefined) {
        updates.push('MODULE_ID = :moduleId');
        binds.moduleId = parseInt(moduleId);
      }

      if (functionCode !== undefined) {
        updates.push('FUNCTION_CODE = :functionCode');
        binds.functionCode = functionCode;
      }

      if (functionName !== undefined) {
        updates.push('FUNCTION_NAME = :functionName');
        binds.functionName = functionName;
      }

      if (description !== undefined) {
        updates.push('DESCRIPTION = :description');
        binds.description = description;
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
        UPDATE SEC.FUNCTIONS 
        SET ${updates.join(', ')}
        WHERE FUNCTION_ID = :functionId
      `;

      const result = await connection.execute(updateQuery, binds, { autoCommit: true });
      
      await connection.close();

      if (result.rowsAffected === 0) {
        return null; // Function not found
      }

      // Return the updated function
      return await this.getById(functionId);
    } catch (error) {
      await connection.close();
      throw error;
    }
  }

  /**
   * Delete a function
   * @param {number} functionId - Function ID
   * @returns {Promise<boolean>} - True if deleted, false if not found
   */
  static async delete(functionId) {
    const connection = await getConnection();
    try {
      const result = await connection.execute(
        'DELETE FROM SEC.FUNCTIONS WHERE FUNCTION_ID = :functionId',
        { functionId },
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

