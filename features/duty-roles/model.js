import { executeQuery, getConnection } from '../../config/db.js';
import oracledb from 'oracledb';
import { FunctionPrivilegeModel } from '../function-privileges/model.js';

/**
 * Duty Role Model - Database operations for SEC.DUTY_ROLES table
 */
export class DutyRoleModel {
  /**
   * Decode function privileges from database format to array of privilege objects
   * @param {string|Array} encodedPrivileges - Encoded privileges from database
   * @returns {Promise<Array>} - Array of privilege objects
   */
/**
 * Decode function privileges from database format to array of privilege objects
 * Supported formats:
 *  - JSON string of IDs:           "[3,4,6]"
 *  - JSON string of objects:       "[{...}, {...}]"
 *  - Comma-separated IDs string:   "3,4,6"
 *  - Array of IDs:                 [3, 4, 6]
 *  - Array of objects:             [{...}, {...}]
 */
static async decodeFunctionPrivileges(encodedPrivileges) {
  if (!encodedPrivileges) {
    return [];
  }

  try {
    let value = encodedPrivileges;

    // 1. If it's a string, try JSON parse first
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch (e) {
        // Not JSON → maybe "3,4,6"
        const idList = value
          .split(',')
          .map((id) => parseInt(id.trim(), 10))
          .filter((id) => !isNaN(id));

        if (idList.length === 0) return [];

        const privileges = await Promise.all(
          idList.map((id) => FunctionPrivilegeModel.getById(id))
        );
        return privileges.filter((p) => p != null);
      }
    }

    // 2. At this point, value is NOT a plain string anymore

    // If it's already an array of full objects → just return as-is
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
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

      const privileges = await Promise.all(
        idList.map((id) => FunctionPrivilegeModel.getById(id))
      );
      return privileges.filter((p) => p != null);
    }

    // Anything else → unsupported format
    console.error('Unsupported FUNCTION_PRIVILEGES format:', encodedPrivileges);
    return [];
  } catch (error) {
    console.error('Error decoding function privileges:', error, 'value=', encodedPrivileges);
    return [];
  }
}


  /**
   * Encode function privileges array to database format
   * @param {Array} privileges - Array of privilege IDs or privilege objects
   * @returns {string} - Encoded string (JSON array of IDs)
   */
  static encodeFunctionPrivileges(privileges) {
    if (!privileges || !Array.isArray(privileges) || privileges.length === 0) {
      return null;
    }

    // Extract IDs from array (handle both ID numbers and objects with privilege_id)
    const privilegeIds = privileges.map(p => {
      if (typeof p === 'number') {
        return p;
      } else if (p && typeof p === 'object') {
        return p.privilege_id || p.PRIVILEGE_ID || p.privilegeId || p.id;
      }
      return null;
    }).filter(id => id !== null && !isNaN(id));

    // Return as JSON string (you can change this to comma-separated if needed)
    return privilegeIds.length > 0 ? JSON.stringify(privilegeIds) : null;
  }

  /**
   * Get all duty roles with pagination and search
   * @param {number} page - Page number (1-based)
   * @param {number} limit - Number of records per page
   * @param {Object} searchParams - Search parameters
   * @param {number} searchParams.dutyRoleId - Filter by DUTY_ROLE_ID
   * @param {string} searchParams.dutyRoleName - Search DUTY_ROLE_NAME (partial match)
   * @param {string} searchParams.roleCode - Search ROLE_CODE (partial match)
   * @param {number} searchParams.moduleId - Filter by MODULE_ID
   * @param {string} searchParams.status - Filter by STATUS
   * @returns {Promise<Object>} - Object containing data, total count, and pagination info
   */
  static async getAll(page = 1, limit = 10, searchParams = {}) {
    const offset = (page - 1) * limit;
    
    // Build WHERE clause and bind variables
    const conditions = [];
    const searchBinds = {};
    
    if (searchParams.dutyRoleId !== undefined && searchParams.dutyRoleId !== null) {
      const dutyRoleId = parseInt(searchParams.dutyRoleId);
      if (!isNaN(dutyRoleId)) {
        conditions.push('DR.DUTY_ROLE_ID = :dutyRoleId');
        searchBinds.dutyRoleId = dutyRoleId;
      }
    }
    
    if (searchParams.dutyRoleName) {
      conditions.push('UPPER(DR.DUTY_ROLE_NAME) LIKE UPPER(:dutyRoleName)');
      searchBinds.dutyRoleName = `%${searchParams.dutyRoleName}%`;
    }
    
    if (searchParams.roleCode) {
      conditions.push('UPPER(DR.ROLE_CODE) LIKE UPPER(:roleCode)');
      searchBinds.roleCode = `%${searchParams.roleCode}%`;
    }
    
    if (searchParams.moduleId !== undefined && searchParams.moduleId !== null) {
      const moduleId = parseInt(searchParams.moduleId);
      if (!isNaN(moduleId)) {
        conditions.push('DR.MODULE_ID = :moduleId');
        searchBinds.moduleId = moduleId;
      }
    }
    
    if (searchParams.status) {
      conditions.push('UPPER(DR.STATUS) = UPPER(:status)');
      searchBinds.status = searchParams.status.toUpperCase();
    }
    
    // General search parameter - searches across duty role name, role code, and description
    if (searchParams.search) {
      const searchConditions = [
        'UPPER(DR.DUTY_ROLE_NAME) LIKE UPPER(:search)',
        'UPPER(DR.ROLE_CODE) LIKE UPPER(:search)',
        'UPPER(DR.DESCRIPTION) LIKE UPPER(:search)',
        'UPPER(M.MODULE_NAME) LIKE UPPER(:search)'
      ];
      conditions.push(`(${searchConditions.join(' OR ')})`);
      searchBinds.search = `%${searchParams.search}%`;
    }
    
    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}` 
      : '';
    
    // Get total count (only use search binds, no pagination binds)
    // Need to include JOINs for search to work on module name
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM SEC.DUTY_ROLES DR
      LEFT JOIN SEC.MODULES M ON DR.MODULE_ID = M.MODULE_ID
      ${whereClause}
    `;
    const countResult = await executeQuery(countQuery, searchBinds);
    const total = countResult.rows[0].TOTAL;
    
    // Get activity counts (total active and inactive) - using same search filters but excluding status
    const activityConditions = conditions.filter(c => !c.includes('STATUS'));
    const activityWhereClause = activityConditions.length > 0 
      ? `WHERE ${activityConditions.join(' AND ')}` 
      : '';
    
    const activeConditions = [...activityConditions];
    activeConditions.push('UPPER(DR.STATUS) = UPPER(:statusActive)');
    const activeWhereClause = activeConditions.length > 0 
      ? `WHERE ${activeConditions.join(' AND ')}` 
      : '';
    
    const inactiveConditions = [...activityConditions];
    inactiveConditions.push('UPPER(DR.STATUS) = UPPER(:statusInactive)');
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
      FROM SEC.DUTY_ROLES DR
      LEFT JOIN SEC.MODULES M ON DR.MODULE_ID = M.MODULE_ID
      ${activeWhereClause}
    `;
    const inactiveCountQuery = `
      SELECT COUNT(*) as total_inactive 
      FROM SEC.DUTY_ROLES DR
      LEFT JOIN SEC.MODULES M ON DR.MODULE_ID = M.MODULE_ID
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
        DR.DUTY_ROLE_ID,
        DR.DUTY_ROLE_NAME,
        DR.ROLE_CODE,
        DR.DESCRIPTION,
        DR.MODULE_ID,
        M.MODULE_NAME,
        DR.STATUS,
        DR.FUNCTION_PRIVILEGES,
        DR.CREATED_AT,
        DR.CREATED_BY,
        DR.UPDATED_AT,
        DR.UPDATED_BY
      FROM SEC.DUTY_ROLES DR
      LEFT JOIN SEC.MODULES M ON DR.MODULE_ID = M.MODULE_ID
      ${whereClause}
      ORDER BY DR.DUTY_ROLE_ID 
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
    `;
    const dataResult = await executeQuery(dataQuery, dataBinds);
    
    // Decode function privileges for each record
    const dataWithDecodedPrivileges = await Promise.all(
      dataResult.rows.map(async (row) => {
        const decodedPrivileges = await this.decodeFunctionPrivileges(row.FUNCTION_PRIVILEGES);
        return {
          ...row,
          FUNCTION_PRIVILEGES_DECODED: decodedPrivileges
        };
      })
    );
    
    return {
      data: dataWithDecodedPrivileges,
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
   * Get duty role by ID
   * @param {number} dutyRoleId - Duty Role ID
   * @returns {Promise<Object|null>} - Duty role object or null if not found
   */
  static async getById(dutyRoleId) {
    const result = await executeQuery(
      `SELECT 
        DR.DUTY_ROLE_ID,
        DR.DUTY_ROLE_NAME,
        DR.ROLE_CODE,
        DR.DESCRIPTION,
        DR.MODULE_ID,
        M.MODULE_NAME,
        DR.STATUS,
        DR.FUNCTION_PRIVILEGES,
        DR.CREATED_AT,
        DR.CREATED_BY,
        DR.UPDATED_AT,
        DR.UPDATED_BY
      FROM SEC.DUTY_ROLES DR
      LEFT JOIN SEC.MODULES M ON DR.MODULE_ID = M.MODULE_ID
      WHERE DR.DUTY_ROLE_ID = :dutyRoleId`,
      { dutyRoleId }
    );
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    // Decode function privileges
    const decodedPrivileges = await this.decodeFunctionPrivileges(row.FUNCTION_PRIVILEGES);
    
    return {
      ...row,
      FUNCTION_PRIVILEGES_DECODED: decodedPrivileges
    };
  }

  /**
   * Create a new duty role
   * @param {Object} dutyRoleData - Duty role data
   * @param {string} dutyRoleData.dutyRoleName - Duty role name
   * @param {string} dutyRoleData.roleCode - Role code
   * @param {string} dutyRoleData.description - Description
   * @param {number} dutyRoleData.moduleId - Module ID
   * @param {Array} dutyRoleData.functionPrivileges - Array of privilege IDs or privilege objects
   * @param {string} dutyRoleData.status - Status (default: 'ACTIVE')
   * @param {string} dutyRoleData.createdBy - Created by user (default: 'SYSTEM')
   * @returns {Promise<Object>} - Created duty role object
   */
  static async create(dutyRoleData) {
    const connection = await getConnection();
    try {
      const {
        dutyRoleName,
        roleCode,
        description,
        moduleId,
        functionPrivileges,
        status = 'ACTIVE',
        createdBy = 'SYSTEM'
      } = dutyRoleData;

      // Validate required fields
      if (!dutyRoleName || !roleCode) {
        throw new Error('dutyRoleName and roleCode are required');
      }

      // Encode function privileges
      const encodedPrivileges = this.encodeFunctionPrivileges(functionPrivileges);

      // Insert new duty role
      const result = await connection.execute(
        `INSERT INTO SEC.DUTY_ROLES (
          DUTY_ROLE_NAME,
          ROLE_CODE,
          DESCRIPTION,
          MODULE_ID,
          FUNCTION_PRIVILEGES,
          STATUS,
          CREATED_BY,
          CREATED_AT
        ) VALUES (
          :dutyRoleName,
          :roleCode,
          :description,
          :moduleId,
          :functionPrivileges,
          :status,
          :createdBy,
          SYSTIMESTAMP
        )
        RETURNING DUTY_ROLE_ID INTO :dutyRoleId`,
        {
          dutyRoleName,
          roleCode,
          description: description || null,
          moduleId: moduleId ? parseInt(moduleId) : null,
          functionPrivileges: encodedPrivileges,
          status,
          createdBy,
          dutyRoleId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
        },
        { autoCommit: true }
      );

      const dutyRoleId = result.outBinds.dutyRoleId[0];
      await connection.close();
      
      // Return the created duty role
      return await this.getById(dutyRoleId);
    } catch (error) {
      await connection.close();
      throw error;
    }
  }

  /**
   * Update a duty role
   * @param {number} dutyRoleId - Duty Role ID
   * @param {Object} dutyRoleData - Duty role data to update
   * @param {string} dutyRoleData.dutyRoleName - Duty role name
   * @param {string} dutyRoleData.roleCode - Role code
   * @param {string} dutyRoleData.description - Description
   * @param {number} dutyRoleData.moduleId - Module ID
   * @param {Array} dutyRoleData.functionPrivileges - Array of privilege IDs or privilege objects
   * @param {string} dutyRoleData.status - Status
   * @param {string} dutyRoleData.updatedBy - Updated by user
   * @returns {Promise<Object>} - Updated duty role object
   */
  static async update(dutyRoleId, dutyRoleData) {
    const connection = await getConnection();
    try {
      const {
        dutyRoleName,
        roleCode,
        description,
        moduleId,
        functionPrivileges,
        status,
        updatedBy = 'SYSTEM'
      } = dutyRoleData;

      // Build UPDATE SET clause dynamically based on provided fields
      const updates = [];
      const binds = { dutyRoleId };

      if (dutyRoleName !== undefined) {
        updates.push('DUTY_ROLE_NAME = :dutyRoleName');
        binds.dutyRoleName = dutyRoleName;
      }

      if (roleCode !== undefined) {
        updates.push('ROLE_CODE = :roleCode');
        binds.roleCode = roleCode;
      }

      if (description !== undefined) {
        updates.push('DESCRIPTION = :description');
        binds.description = description;
      }

      if (moduleId !== undefined) {
        updates.push('MODULE_ID = :moduleId');
        binds.moduleId = moduleId ? parseInt(moduleId) : null;
      }

      if (functionPrivileges !== undefined) {
        const encodedPrivileges = this.encodeFunctionPrivileges(functionPrivileges);
        updates.push('FUNCTION_PRIVILEGES = :functionPrivileges');
        binds.functionPrivileges = encodedPrivileges;
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
        UPDATE SEC.DUTY_ROLES 
        SET ${updates.join(', ')}
        WHERE DUTY_ROLE_ID = :dutyRoleId
      `;

      const result = await connection.execute(updateQuery, binds, { autoCommit: true });
      
      await connection.close();

      if (result.rowsAffected === 0) {
        return null; // Duty role not found
      }

      // Return the updated duty role
      return await this.getById(dutyRoleId);
    } catch (error) {
      await connection.close();
      throw error;
    }
  }

  /**
   * Delete a duty role
   * @param {number} dutyRoleId - Duty Role ID
   * @returns {Promise<boolean>} - True if deleted, false if not found
   */
  static async delete(dutyRoleId) {
    const connection = await getConnection();
    try {
      const result = await connection.execute(
        'DELETE FROM SEC.DUTY_ROLES WHERE DUTY_ROLE_ID = :dutyRoleId',
        { dutyRoleId },
        { autoCommit: true }
      );

      await connection.close();
      return result.rowsAffected > 0;
    } catch (error) {
      await connection.close();
      throw error;
    }
  }

  /**
   * Add privileges to a duty role (additive - merges with existing)
   * @param {number} dutyRoleId - Duty Role ID
   * @param {Array<number|string>} privilegeIds - Array of privilege IDs to add
   * @param {string} updatedBy - Updated by user
   * @returns {Promise<Object>} - Object with updated duty role and validation info
   */
  static async addPrivilegesToDutyRole(dutyRoleId, privilegeIds, updatedBy = 'SYSTEM') {
    const connection = await getConnection();
    try {
      // Get current duty role
      const currentRole = await executeQuery(
        'SELECT FUNCTION_PRIVILEGES FROM SEC.DUTY_ROLES WHERE DUTY_ROLE_ID = :dutyRoleId',
        { dutyRoleId }
      );

      if (currentRole.rows.length === 0) {
        await connection.close();
        return null; // Duty role not found
      }

      // Get existing privilege IDs
      const existingEncoded = currentRole.rows[0].FUNCTION_PRIVILEGES;
      const existingPrivileges = await this.decodeFunctionPrivileges(existingEncoded);
      const existingIds = existingPrivileges.map(p => p.PRIVILEGE_ID || p.privilege_id);

      // Convert new privilege IDs to numbers and filter out invalid ones
      const newIds = privilegeIds.map(id => {
        if (typeof id === 'number') return id;
        if (typeof id === 'string') return parseInt(id, 10);
        return null;
      }).filter(id => id !== null && !isNaN(id));

      // Separate already assigned and newly assigned privileges
      const alreadyAssignedIds = newIds.filter(id => existingIds.includes(id));
      const newlyAssignedIds = newIds.filter(id => !existingIds.includes(id));

      // If all privileges are already assigned, return early without updating
      if (newlyAssignedIds.length === 0) {
        await connection.close();
        const dutyRoleData = await this.getById(dutyRoleId);
        return {
          dutyRoleData,
          alreadyAssignedIds,
          newlyAssignedIds: [],
          wasUpdated: false
        };
      }

      // Merge and deduplicate
      const mergedIds = [...new Set([...existingIds, ...newIds])];

      // Encode the merged privilege IDs
      const encodedPrivileges = this.encodeFunctionPrivileges(mergedIds);

      // Update the duty role
      const result = await connection.execute(
        `UPDATE SEC.DUTY_ROLES 
        SET FUNCTION_PRIVILEGES = :functionPrivileges,
            UPDATED_AT = SYSTIMESTAMP,
            UPDATED_BY = :updatedBy
        WHERE DUTY_ROLE_ID = :dutyRoleId`,
        {
          functionPrivileges: encodedPrivileges,
          updatedBy,
          dutyRoleId
        },
        { autoCommit: true }
      );

      await connection.close();

      if (result.rowsAffected === 0) {
        return null;
      }

      // Return the updated duty role with validation info
      const dutyRoleData = await this.getById(dutyRoleId);
      return {
        dutyRoleData,
        alreadyAssignedIds,
        newlyAssignedIds,
        wasUpdated: true
      };
    } catch (error) {
      await connection.close();
      throw error;
    }
  }

  /**
   * Remove a privilege from a duty role
   * @param {number} dutyRoleId - Duty Role ID
   * @param {number} privilegeId - Privilege ID to remove
   * @param {string} updatedBy - Updated by user
   * @returns {Promise<Object>} - Object with updated duty role and validation info
   */
  static async removePrivilegeFromDutyRole(dutyRoleId, privilegeId, updatedBy = 'SYSTEM') {
    const connection = await getConnection();
    try {
      // Get current duty role
      const currentRole = await executeQuery(
        'SELECT FUNCTION_PRIVILEGES FROM SEC.DUTY_ROLES WHERE DUTY_ROLE_ID = :dutyRoleId',
        { dutyRoleId }
      );

      if (currentRole.rows.length === 0) {
        await connection.close();
        return null; // Duty role not found
      }

      // Get existing privilege IDs
      const existingEncoded = currentRole.rows[0].FUNCTION_PRIVILEGES;
      const existingPrivileges = await this.decodeFunctionPrivileges(existingEncoded);
      const existingIds = existingPrivileges.map(p => p.PRIVILEGE_ID || p.privilege_id);

      // Check if privilege is already removed
      if (!existingIds.includes(privilegeId)) {
        await connection.close();
        const dutyRoleData = await this.getById(dutyRoleId);
        return {
          dutyRoleData,
          wasRemoved: false,
          wasUpdated: false
        };
      }

      // Remove the privilege ID
      const filteredIds = existingIds.filter(id => id !== privilegeId);

      // Encode the filtered privilege IDs
      const encodedPrivileges = this.encodeFunctionPrivileges(filteredIds);

      // Update the duty role
      const result = await connection.execute(
        `UPDATE SEC.DUTY_ROLES 
        SET FUNCTION_PRIVILEGES = :functionPrivileges,
            UPDATED_AT = SYSTIMESTAMP,
            UPDATED_BY = :updatedBy
        WHERE DUTY_ROLE_ID = :dutyRoleId`,
        {
          functionPrivileges: encodedPrivileges,
          updatedBy,
          dutyRoleId
        },
        { autoCommit: true }
      );

      await connection.close();

      if (result.rowsAffected === 0) {
        return null;
      }

      // Return the updated duty role with validation info
      const dutyRoleData = await this.getById(dutyRoleId);
      return {
        dutyRoleData,
        wasRemoved: true,
        wasUpdated: true
      };
    } catch (error) {
      await connection.close();
      throw error;
    }
  }
}

