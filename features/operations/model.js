import { executeQuery, getConnection } from '../../config/db.js';
import oracledb from 'oracledb';

/**
 * Operation Model - Database operations for SEC.OPERATIONS table
 */
export class OperationModel {
  /**
   * Get all operations with pagination and search
   * @param {number} page - Page number (1-based)
   * @param {number} limit - Number of records per page
   * @param {Object} searchParams - Search parameters
   * @param {number} searchParams.operationId - Filter by OPERATION_ID
   * @param {string} searchParams.operationCode - Search OPERATION_CODE (partial match)
   * @param {string} searchParams.operationName - Search OPERATION_NAME (partial match)
   * @param {string} searchParams.status - Filter by STATUS
   * @returns {Promise<Object>} - Object containing data, total count, and pagination info
   */
  static async getAll(page = 1, limit = 10, searchParams = {}) {
    const offset = (page - 1) * limit;
    
    // Build WHERE clause and bind variables
    const conditions = [];
    const searchBinds = {};
    
    if (searchParams.operationId !== undefined && searchParams.operationId !== null) {
      const operationId = parseInt(searchParams.operationId);
      if (!isNaN(operationId)) {
        conditions.push('OPERATION_ID = :operationId');
        searchBinds.operationId = operationId;
      }
    }
    
    if (searchParams.operationCode) {
      conditions.push('UPPER(OPERATION_CODE) LIKE UPPER(:operationCode)');
      searchBinds.operationCode = `%${searchParams.operationCode}%`;
    }
    
    if (searchParams.operationName) {
      conditions.push('UPPER(OPERATION_NAME) LIKE UPPER(:operationName)');
      searchBinds.operationName = `%${searchParams.operationName}%`;
    }
    
    if (searchParams.status) {
      conditions.push('UPPER(STATUS) = UPPER(:status)');
      searchBinds.status = searchParams.status.toUpperCase();
    }
    
    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}` 
      : '';
    
    // Get total count (only use search binds, no pagination binds)
    const countQuery = `SELECT COUNT(*) as total FROM SEC.OPERATIONS ${whereClause}`;
    const countResult = await executeQuery(countQuery, searchBinds);
    const total = countResult.rows[0].TOTAL;
    
    // Get activity counts (total active and inactive) - using same search filters but excluding status
    const activityConditions = conditions.filter(c => !c.includes('STATUS'));
    const activityWhereClause = activityConditions.length > 0 
      ? `WHERE ${activityConditions.join(' AND ')}` 
      : '';
    
    const activeConditions = [...activityConditions];
    activeConditions.push('UPPER(STATUS) = UPPER(:statusActive)');
    const activeWhereClause = activeConditions.length > 0 
      ? `WHERE ${activeConditions.join(' AND ')}` 
      : '';
    
    const inactiveConditions = [...activityConditions];
    inactiveConditions.push('UPPER(STATUS) = UPPER(:statusInactive)');
    const inactiveWhereClause = inactiveConditions.length > 0 
      ? `WHERE ${inactiveConditions.join(' AND ')}` 
      : '';
    
    const activeBindParams = { ...searchBinds };
    delete activeBindParams.status;
    activeBindParams.statusActive = 'ACTIVE';
    
    const inactiveBindParams = { ...searchBinds };
    delete inactiveBindParams.status;
    inactiveBindParams.statusInactive = 'INACTIVE';
    
    const activeCountQuery = `SELECT COUNT(*) as total_active FROM SEC.OPERATIONS ${activeWhereClause}`;
    const inactiveCountQuery = `SELECT COUNT(*) as total_inactive FROM SEC.OPERATIONS ${inactiveWhereClause}`;
    
    const activeCountResult = await executeQuery(activeCountQuery, activeBindParams);
    const inactiveCountResult = await executeQuery(inactiveCountQuery, inactiveBindParams);
    
    const totalActive = activeCountResult.rows[0].TOTAL_ACTIVE;
    const totalInactive = inactiveCountResult.rows[0].TOTAL_INACTIVE;
    
    // Get paginated data (combine search binds with pagination binds)
    const dataBinds = { ...searchBinds, offset, limit };
    const dataQuery = `
      SELECT * FROM SEC.OPERATIONS 
      ${whereClause}
      ORDER BY OPERATION_ID 
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
   * Get all operations without pagination (for dropdowns)
   * @param {Object} searchParams - Optional search parameters
   * @param {string} searchParams.status - Filter by STATUS (default: 'ACTIVE')
   * @returns {Promise<Array>} - Array of operation objects
   */
  static async getAllForDropdown(searchParams = {}) {
    // Build WHERE clause and bind variables
    const conditions = [];
    const searchBinds = {};
    
    // Default to ACTIVE operations for dropdowns if not specified
    const status = searchParams.status || 'ACTIVE';
    conditions.push('UPPER(STATUS) = UPPER(:status)');
    searchBinds.status = status.toUpperCase();
    
    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    
    // Get all operations without pagination
    const dataQuery = `
      SELECT * FROM SEC.OPERATIONS 
      ${whereClause}
      ORDER BY OPERATION_NAME
    `;
    const dataResult = await executeQuery(dataQuery, searchBinds);
    
    return dataResult.rows;
  }

  /**
   * Get operation by ID
   * @param {number} operationId - Operation ID
   * @returns {Promise<Object|null>} - Operation object or null if not found
   */
  static async getById(operationId) {
    const result = await executeQuery(
      'SELECT * FROM SEC.OPERATIONS WHERE OPERATION_ID = :operationId',
      { operationId }
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Create a new operation
   * @param {Object} operationData - Operation data
   * @param {string} operationData.operationCode - Operation code
   * @param {string} operationData.operationName - Operation name
   * @param {string} operationData.description - Description
   * @param {string} operationData.status - Status (default: 'ACTIVE')
   * @param {string} operationData.createdBy - Created by user (default: 'SYSTEM')
   * @returns {Promise<Object>} - Created operation object
   */
  static async create(operationData) {
    const connection = await getConnection();
    try {
      const {
        operationCode,
        operationName,
        description,
        status = 'ACTIVE',
        createdBy = 'SYSTEM'
      } = operationData;

      // Validate required fields
      if (!operationCode || !operationName) {
        throw new Error('operationCode and operationName are required');
      }

      // Insert new operation
      const result = await connection.execute(
        `INSERT INTO SEC.OPERATIONS (
          OPERATION_CODE,
          OPERATION_NAME,
          DESCRIPTION,
          STATUS,
          CREATED_BY,
          CREATED_AT
        ) VALUES (
          :operationCode,
          :operationName,
          :description,
          :status,
          :createdBy,
          SYSTIMESTAMP
        )
        RETURNING OPERATION_ID INTO :operationId`,
        {
          operationCode,
          operationName,
          description: description || null,
          status,
          createdBy,
          operationId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
        },
        { autoCommit: true }
      );

      const operationId = result.outBinds.operationId[0];
      await connection.close();
      
      // Return the created operation
      return await this.getById(operationId);
    } catch (error) {
      await connection.close();
      throw error;
    }
  }

  /**
   * Update an operation
   * @param {number} operationId - Operation ID
   * @param {Object} operationData - Operation data to update
   * @param {string} operationData.operationCode - Operation code
   * @param {string} operationData.operationName - Operation name
   * @param {string} operationData.description - Description
   * @param {string} operationData.status - Status
   * @param {string} operationData.updatedBy - Updated by user
   * @returns {Promise<Object>} - Updated operation object
   */
  static async update(operationId, operationData) {
    const connection = await getConnection();
    try {
      const {
        operationCode,
        operationName,
        description,
        status,
        updatedBy = 'SYSTEM'
      } = operationData;

      // Build UPDATE SET clause dynamically based on provided fields
      const updates = [];
      const binds = { operationId };

      if (operationCode !== undefined) {
        updates.push('OPERATION_CODE = :operationCode');
        binds.operationCode = operationCode;
      }

      if (operationName !== undefined) {
        updates.push('OPERATION_NAME = :operationName');
        binds.operationName = operationName;
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
        UPDATE SEC.OPERATIONS 
        SET ${updates.join(', ')}
        WHERE OPERATION_ID = :operationId
      `;

      const result = await connection.execute(updateQuery, binds, { autoCommit: true });
      
      await connection.close();

      if (result.rowsAffected === 0) {
        return null; // Operation not found
      }

      // Return the updated operation
      return await this.getById(operationId);
    } catch (error) {
      await connection.close();
      throw error;
    }
  }

  /**
   * Delete an operation
   * @param {number} operationId - Operation ID
   * @returns {Promise<boolean>} - True if deleted, false if not found
   */
  static async delete(operationId) {
    const connection = await getConnection();
    try {
      const result = await connection.execute(
        'DELETE FROM SEC.OPERATIONS WHERE OPERATION_ID = :operationId',
        { operationId },
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

