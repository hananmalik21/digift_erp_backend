import { executeQuery, getConnection } from '../../config/db.js';
import oracledb from 'oracledb';

/**
 * Module Model - Database operations for SEC.MODULES table
 */
export class ModuleModel {
  /**
   * Get all modules with pagination and search
   * @param {number} page - Page number (1-based)
   * @param {number} limit - Number of records per page
   * @param {Object} searchParams - Search parameters
   * @param {number} searchParams.moduleId - Filter by MODULE_ID
   * @param {string} searchParams.moduleCode - Search MODULE_CODE (partial match)
   * @param {string} searchParams.moduleName - Search MODULE_NAME (partial match)
   * @param {string} searchParams.status - Filter by STATUS
   * @returns {Promise<Object>} - Object containing data, total count, and pagination info
   */
  static async getAll(page = 1, limit = 10, searchParams = {}) {
    const offset = (page - 1) * limit;
    
    // Build WHERE clause and bind variables
    const conditions = [];
    const searchBinds = {};
    
    if (searchParams.moduleId !== undefined && searchParams.moduleId !== null) {
      const moduleId = parseInt(searchParams.moduleId);
      if (!isNaN(moduleId)) {
        conditions.push('MODULE_ID = :moduleId');
        searchBinds.moduleId = moduleId;
      }
    }
    
    if (searchParams.moduleCode) {
      conditions.push('UPPER(MODULE_CODE) LIKE UPPER(:moduleCode)');
      searchBinds.moduleCode = `%${searchParams.moduleCode}%`;
    }
    
    if (searchParams.moduleName) {
      conditions.push('UPPER(MODULE_NAME) LIKE UPPER(:moduleName)');
      searchBinds.moduleName = `%${searchParams.moduleName}%`;
    }
    
    if (searchParams.status) {
      conditions.push('UPPER(STATUS) = UPPER(:status)');
      searchBinds.status = searchParams.status.toUpperCase();
    }
    
    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}` 
      : '';
    
    // Get total count (only use search binds, no pagination binds)
    const countQuery = `SELECT COUNT(*) as total FROM SEC.MODULES ${whereClause}`;
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
    
    const activeCountQuery = `SELECT COUNT(*) as total_active FROM SEC.MODULES ${activeWhereClause}`;
    const inactiveCountQuery = `SELECT COUNT(*) as total_inactive FROM SEC.MODULES ${inactiveWhereClause}`;
    
    const activeCountResult = await executeQuery(activeCountQuery, activeBindParams);
    const inactiveCountResult = await executeQuery(inactiveCountQuery, inactiveBindParams);
    
    const totalActive = activeCountResult.rows[0].TOTAL_ACTIVE;
    const totalInactive = inactiveCountResult.rows[0].TOTAL_INACTIVE;
    
    // Get paginated data (combine search binds with pagination binds)
    const dataBinds = { ...searchBinds, offset, limit };
    const dataQuery = `
      SELECT * FROM SEC.MODULES 
      ${whereClause}
      ORDER BY MODULE_ID 
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
   * Get all modules without pagination (for dropdowns)
   * @param {Object} searchParams - Optional search parameters
   * @param {string} searchParams.status - Filter by STATUS (default: 'ACTIVE')
   * @returns {Promise<Array>} - Array of module objects
   */
  static async getAllForDropdown(searchParams = {}) {
    // Build WHERE clause and bind variables
    const conditions = [];
    const searchBinds = {};
    
    // Default to ACTIVE modules for dropdowns if not specified
    const status = searchParams.status || 'ACTIVE';
    conditions.push('UPPER(STATUS) = UPPER(:status)');
    searchBinds.status = status.toUpperCase();
    
    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    
    // Get all modules without pagination
    const dataQuery = `
      SELECT * FROM SEC.MODULES 
      ${whereClause}
      ORDER BY MODULE_NAME
    `;
    const dataResult = await executeQuery(dataQuery, searchBinds);
    
    return dataResult.rows;
  }

  /**
   * Get module by ID
   * @param {number} moduleId - Module ID
   * @returns {Promise<Object|null>} - Module object or null if not found
   */
  static async getById(moduleId) {
    const result = await executeQuery(
      'SELECT * FROM SEC.MODULES WHERE MODULE_ID = :moduleId',
      { moduleId }
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Create a new module
   * @param {Object} moduleData - Module data
   * @param {string} moduleData.moduleCode - Module code
   * @param {string} moduleData.moduleName - Module name
   * @param {string} moduleData.description - Description
   * @param {string} moduleData.status - Status (default: 'ACTIVE')
   * @param {string} moduleData.createdBy - Created by user (default: 'SYSTEM')
   * @returns {Promise<Object>} - Created module object
   */
  static async create(moduleData) {
    const connection = await getConnection();
    try {
      const {
        moduleCode,
        moduleName,
        description,
        status = 'ACTIVE',
        createdBy = 'SYSTEM'
      } = moduleData;

      // Validate required fields
      if (!moduleCode || !moduleName) {
        throw new Error('moduleCode and moduleName are required');
      }

      // Insert new module
      const result = await connection.execute(
        `INSERT INTO SEC.MODULES (
          MODULE_CODE,
          MODULE_NAME,
          DESCRIPTION,
          STATUS,
          CREATED_BY,
          CREATED_AT
        ) VALUES (
          :moduleCode,
          :moduleName,
          :description,
          :status,
          :createdBy,
          SYSTIMESTAMP
        )
        RETURNING MODULE_ID INTO :moduleId`,
        {
          moduleCode,
          moduleName,
          description: description || null,
          status,
          createdBy,
          moduleId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
        },
        { autoCommit: true }
      );

      const moduleId = result.outBinds.moduleId[0];
      await connection.close();
      
      // Return the created module
      return await this.getById(moduleId);
    } catch (error) {
      await connection.close();
      throw error;
    }
  }

  /**
   * Update a module
   * @param {number} moduleId - Module ID
   * @param {Object} moduleData - Module data to update
   * @param {string} moduleData.moduleCode - Module code
   * @param {string} moduleData.moduleName - Module name
   * @param {string} moduleData.description - Description
   * @param {string} moduleData.status - Status
   * @param {string} moduleData.updatedBy - Updated by user
   * @returns {Promise<Object>} - Updated module object
   */
  static async update(moduleId, moduleData) {
    const connection = await getConnection();
    try {
      const {
        moduleCode,
        moduleName,
        description,
        status,
        updatedBy = 'SYSTEM'
      } = moduleData;

      // Build UPDATE SET clause dynamically based on provided fields
      const updates = [];
      const binds = { moduleId };

      if (moduleCode !== undefined) {
        updates.push('MODULE_CODE = :moduleCode');
        binds.moduleCode = moduleCode;
      }

      if (moduleName !== undefined) {
        updates.push('MODULE_NAME = :moduleName');
        binds.moduleName = moduleName;
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
        UPDATE SEC.MODULES 
        SET ${updates.join(', ')}
        WHERE MODULE_ID = :moduleId
      `;

      const result = await connection.execute(updateQuery, binds, { autoCommit: true });
      
      await connection.close();

      if (result.rowsAffected === 0) {
        return null; // Module not found
      }

      // Return the updated module
      return await this.getById(moduleId);
    } catch (error) {
      await connection.close();
      throw error;
    }
  }

  /**
   * Delete a module
   * @param {number} moduleId - Module ID
   * @returns {Promise<boolean>} - True if deleted, false if not found
   */
  static async delete(moduleId) {
    const connection = await getConnection();
    try {
      const result = await connection.execute(
        'DELETE FROM SEC.MODULES WHERE MODULE_ID = :moduleId',
        { moduleId },
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

