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
   * Helper: decode various stored formats into clean array of numeric IDs
   * Works for INHERITED_FROM_ROLES / INHERITED_CHILD_ROLES and generic ID lists.
   *
   * Supported formats:
   *  - JSON string "[1,2,3]"
   *  - comma string "1,2,3"
   *  - array [1, "2", 3]
   */
  static decodeIdArray(encoded) {
    if (!encoded) return [];

    try {
      let value = encoded;

      if (typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch (e) {
          return value
            .split(',')
            .map(v => parseInt(v.trim(), 10))
            .filter(v => !isNaN(v));
        }
      }

      if (Array.isArray(value)) {
        return value
          .map(v =>
            typeof v === 'number'
              ? v
              : parseInt(v, 10)
          )
          .filter(v => !isNaN(v));
      }

      return [];
    } catch (err) {
      console.error('decodeIdArray error:', err, 'value=', encoded);
      return [];
    }
  }

  /**
   * Helper: encode array of IDs into JSON string, or null
   */
  static encodeIdArray(ids) {
    if (!ids || !Array.isArray(ids) || ids.length === 0) return null;

    const clean = [...new Set(
      ids
        .map(v =>
          typeof v === 'number'
            ? v
            : parseInt(v, 10)
        )
        .filter(v => !isNaN(v))
    )];

    return clean.length ? JSON.stringify(clean) : null;
  }

  /**
   * Helper: fetch duty roles by IDs (for inherited_from_roles / inherited_child_roles display)
   */
  static async fetchDutyRolesByIds(idList) {
    if (!idList || idList.length === 0) return [];

    const uniqueIds = [...new Set(idList)].filter(id => !isNaN(id));
    if (uniqueIds.length === 0) return [];

    const binds = {};
    const placeholders = uniqueIds
      .map((id, idx) => {
        const key = `id${idx}`;
        binds[key] = id;
        return `:${key}`;
      })
      .join(',');

    const sql = `
      SELECT DUTY_ROLE_ID, DUTY_ROLE_NAME, ROLE_CODE, STATUS
        FROM SEC.DUTY_ROLES
       WHERE DUTY_ROLE_ID IN (${placeholders})
       ORDER BY DUTY_ROLE_ID
    `;

    const result = await executeQuery(sql, binds);

    return result.rows.map(row => ({
      duty_role_id: row.DUTY_ROLE_ID,
      duty_role_name: row.DUTY_ROLE_NAME,
      role_code: row.ROLE_CODE,
      status: row.STATUS
    }));
  }

  /**
   * Helper: recursively collect ALL privilege IDs from parents and their parents.
   */
  static async collectPrivilegesFromParents(parentIds, visited = new Set()) {
    if (!parentIds || parentIds.length === 0) return [];

    const uniqueParentIds = [...new Set(parentIds)].filter(
      id => !isNaN(id) && !visited.has(id)
    );
    if (uniqueParentIds.length === 0) return [];

    uniqueParentIds.forEach(id => visited.add(id));

    const binds = {};
    const placeholders = uniqueParentIds
      .map((id, idx) => {
        const key = `parentId${idx}`;
        binds[key] = id;
        return `:${key}`;
      })
      .join(',');

    const sql = `
      SELECT DUTY_ROLE_ID, FUNCTION_PRIVILEGES, INHERITED_FROM_ROLES
        FROM SEC.DUTY_ROLES
       WHERE DUTY_ROLE_ID IN (${placeholders})
    `;

    try {
      const result = await executeQuery(sql, binds);
      const allPrivilegeIds = new Set();

      if (!result || !result.rows || result.rows.length === 0) {
        return [];
      }

      for (const row of result.rows) {
        // explicit privileges on this parent
        if (row.FUNCTION_PRIVILEGES) {
          const explicitIds = this.decodeIdArray(row.FUNCTION_PRIVILEGES);
          explicitIds.forEach(id => allPrivilegeIds.add(id));
        }

        // recursively from parent's parents
        if (row.INHERITED_FROM_ROLES) {
          const grandParentIds = this.decodeIdArray(row.INHERITED_FROM_ROLES);
          if (grandParentIds.length > 0) {
            const grandParentPrivileges = await this.collectPrivilegesFromParents(
              grandParentIds,
              visited
            );
            grandParentPrivileges.forEach(id => allPrivilegeIds.add(id));
          }
        }
      }

      return Array.from(allPrivilegeIds);
    } catch (error) {
      console.error('Error in collectPrivilegesFromParents:', error);
      console.error('Parent IDs:', parentIds);
      throw error;
    }
  }

  /**
   * Decode INHERITED_FROM_ROLES / INHERITED_CHILD_ROLES to minimal duty role objects.
   */
  static async decodeDutyRoleArray(encodedValue) {
    if (!encodedValue) return [];

    try {
      let value = encodedValue;

      if (typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch (e) {
          const idList = value
            .split(',')
            .map(id => parseInt(id.trim(), 10))
            .filter(id => !isNaN(id));

          if (idList.length === 0) return [];
          return await this.fetchDutyRolesByIds(idList);
        }
      }

      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
        return value
          .map(dr => ({
            duty_role_id:
              dr.duty_role_id ??
              dr.DUTY_ROLE_ID ??
              dr.id ??
              null,
            duty_role_name:
              dr.duty_role_name ??
              dr.DUTY_ROLE_NAME ??
              dr.name ??
              null,
            role_code:
              dr.role_code ??
              dr.ROLE_CODE ??
              dr.code ??
              null,
            status:
              dr.status ??
              dr.STATUS ??
              null
          }))
          .filter(dr => dr.duty_role_id !== null);
      }

      if (Array.isArray(value)) {
        const idList = value
          .map(v =>
            typeof v === 'number'
              ? v
              : parseInt(v, 10)
          )
          .filter(id => !isNaN(id));

        if (idList.length === 0) return [];
        return await this.fetchDutyRolesByIds(idList);
      }

      console.error('Unsupported INHERITED_* format:', encodedValue);
      return [];
    } catch (error) {
      console.error('Error decoding duty role array:', error, 'value=', encodedValue);
      return [];
    }
  }

  /**
   * Compute EFFECTIVE privileges:
   *  explicit (this role) + inherited from all parents (recursively).
   *
   * Returns array of privilege objects with an `inherited` flag.
   */
  static async computeEffectivePrivileges(row) {
    try {
      const privilegesRaw = row.FUNCTION_PRIVILEGES || row.function_privileges || null;
      const inheritedFromRaw = row.INHERITED_FROM_ROLES || row.inherited_from_roles || null;
      
      const explicitIds = this.decodeIdArray(privilegesRaw);
      const parentIds = this.decodeIdArray(inheritedFromRaw);
      
      // Collect inherited privileges from all parents (recursively)
      const inheritedIds = await this.collectPrivilegesFromParents(parentIds);

      // Merge explicit + inherited (deduplicate)
      const allIds = [...new Set([...explicitIds, ...inheritedIds])];

      if (allIds.length === 0) return [];
      
      // Fetch full privilege objects
      const privileges = await Promise.all(
        allIds.map((id) => FunctionPrivilegeModel.getById(id))
      );
      const validPrivileges = privileges.filter((p) => p != null);
      
      // Add inherited flag to each privilege
      const inheritedIdsSet = new Set(inheritedIds);
      
      return validPrivileges.map(priv => ({
        ...priv,
        inherited: inheritedIdsSet.has(priv.PRIVILEGE_ID || priv.privilege_id)
      }));
    } catch (error) {
      console.error('Error in computeEffectivePrivileges:', error);
      console.error('Row data:', { 
        DUTY_ROLE_ID: row.DUTY_ROLE_ID || row.duty_role_id,
        FUNCTION_PRIVILEGES: row.FUNCTION_PRIVILEGES || row.function_privileges, 
        INHERITED_FROM_ROLES: row.INHERITED_FROM_ROLES || row.inherited_from_roles 
      });
      // Return at least explicit privileges if computation fails
      const privilegesRaw = row.FUNCTION_PRIVILEGES || row.function_privileges || null;
      const explicitIds = this.decodeIdArray(privilegesRaw);
      if (explicitIds.length === 0) return [];
      const privileges = await Promise.all(
        explicitIds.map((id) => FunctionPrivilegeModel.getById(id))
      );
      const validPrivileges = privileges.filter((p) => p != null);
      return validPrivileges.map(priv => ({
        ...priv,
        inherited: false
      }));
    }
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
        DR.INHERITED_FROM_ROLES,
        DR.INHERITED_CHILD_ROLES,
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
    
    // Decode effective privileges + inherited_from_roles + inherited_child_roles for each record
    const dataWithDecoded = await Promise.all(
      dataResult.rows.map(async (row) => {
        const effectivePrivileges = await this.computeEffectivePrivileges(row);
        const decodedInheritedFrom = await this.decodeDutyRoleArray(row.INHERITED_FROM_ROLES);
        const decodedInheritedChild = await this.decodeDutyRoleArray(row.INHERITED_CHILD_ROLES);

        return {
          ...row,
          FUNCTION_PRIVILEGES_DECODED: effectivePrivileges,
          INHERITED_FROM_ROLES_DECODED: decodedInheritedFrom,
          INHERITED_CHILD_ROLES_DECODED: decodedInheritedChild
        };
      })
    );
    
    return {
      data: dataWithDecoded,
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
        DR.INHERITED_FROM_ROLES,
        DR.INHERITED_CHILD_ROLES,
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
    const effectivePrivileges = await this.computeEffectivePrivileges(row);
    const decodedInheritedFrom = await this.decodeDutyRoleArray(row.INHERITED_FROM_ROLES);
    const decodedInheritedChild = await this.decodeDutyRoleArray(row.INHERITED_CHILD_ROLES);

    return {
      ...row,
      FUNCTION_PRIVILEGES_DECODED: effectivePrivileges,
      INHERITED_FROM_ROLES_DECODED: decodedInheritedFrom,
      INHERITED_CHILD_ROLES_DECODED: decodedInheritedChild
    };
  }

  /**
   * Create a new duty role
   * - FUNCTION_PRIVILEGES column stores only EXPLICIT privilege IDs.
   * - INHERITED_FROM_ROLES sets parents.
   * - Parents' INHERITED_CHILD_ROLES is updated to include this child.
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
        inheritedFromRoles,
        status = 'ACTIVE',
        createdBy = 'SYSTEM'
      } = dutyRoleData;

      if (!dutyRoleName || !roleCode) {
        throw new Error('dutyRoleName and roleCode are required');
      }

      // normalize parents
      const parentIds = Array.isArray(inheritedFromRoles)
        ? inheritedFromRoles
            .map(v => (typeof v === 'number' ? v : parseInt(v, 10)))
            .filter(v => !isNaN(v))
        : [];

      // explicit privileges only
      const encodedPrivileges = this.encodeFunctionPrivileges(functionPrivileges || []);

      const encodedInheritedFrom =
        parentIds.length > 0 ? this.encodeIdArray(parentIds) : null;

      const columns = [
        'DUTY_ROLE_NAME',
        'ROLE_CODE',
        'DESCRIPTION',
        'MODULE_ID',
        'STATUS',
        'CREATED_BY',
        'CREATED_AT'
      ];
      const values = [
        ':dutyRoleName',
        ':roleCode',
        ':description',
        ':moduleId',
        ':status',
        ':createdBy',
        'SYSTIMESTAMP'
      ];
      const binds = {
        dutyRoleName,
        roleCode,
        description: description || null,
        moduleId: moduleId ? parseInt(moduleId) : null,
        status,
        createdBy,
        dutyRoleId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
      };

      if (encodedPrivileges !== null) {
        columns.splice(4, 0, 'FUNCTION_PRIVILEGES'); // after MODULE_ID
        values.splice(4, 0, ':functionPrivileges');
        binds.functionPrivileges = encodedPrivileges;
      }

      if (encodedInheritedFrom !== null) {
        columns.splice(5, 0, 'INHERITED_FROM_ROLES'); // after FUNCTION_PRIVILEGES
        values.splice(5, 0, ':inheritedFromRoles');
        binds.inheritedFromRoles = encodedInheritedFrom;
      }

      const result = await connection.execute(
        `INSERT INTO SEC.DUTY_ROLES (
          ${columns.join(', ')}
        ) VALUES (
          ${values.join(', ')}
        )
        RETURNING DUTY_ROLE_ID INTO :dutyRoleId`,
        binds,
        { autoCommit: false }
      );

      const dutyRoleId = result.outBinds.dutyRoleId[0];

      // sync: add this child to each parent's INHERITED_CHILD_ROLES list
      for (const parentId of parentIds) {
        const parentRes = await connection.execute(
          `SELECT INHERITED_CHILD_ROLES
             FROM SEC.DUTY_ROLES
            WHERE DUTY_ROLE_ID = :parentId`,
          { parentId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (parentRes.rows.length === 0) continue;

        const existingChildrenEncoded = parentRes.rows[0].INHERITED_CHILD_ROLES;
        const existingChildrenIds = this.decodeIdArray(existingChildrenEncoded);

        if (!existingChildrenIds.includes(dutyRoleId)) {
          const newChildrenIds = [...existingChildrenIds, dutyRoleId];
          const encodedChildren = this.encodeIdArray(newChildrenIds);

          await connection.execute(
            `UPDATE SEC.DUTY_ROLES
                SET INHERITED_CHILD_ROLES = :inheritedChildRoles,
                    UPDATED_AT = SYSTIMESTAMP
              WHERE DUTY_ROLE_ID = :parentId`,
            {
              inheritedChildRoles: encodedChildren,
              parentId
            },
            { autoCommit: false }
          );
        }
      }

      await connection.commit();
      await connection.close();
      
      return await this.getById(dutyRoleId);
    } catch (error) {
      try { await connection.rollback(); } catch (_) {}
      await connection.close();
      throw error;
    }
  }

  /**
   * Update a duty role
   * - functionPrivileges modifies only EXPLICIT privileges.
   * - inheritedFromRoles modifies parent links and keeps INHERITED_CHILD_ROLES in sync.
   * - effective privileges are computed at read-time.
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
        inheritedFromRoles,
        status,
        updatedBy = 'SYSTEM'
      } = dutyRoleData;

      // get current parents and explicit privileges for validation
      const currentRes = await connection.execute(
        `SELECT INHERITED_FROM_ROLES, FUNCTION_PRIVILEGES
           FROM SEC.DUTY_ROLES
          WHERE DUTY_ROLE_ID = :dutyRoleId`,
        { dutyRoleId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (currentRes.rows.length === 0) {
        await connection.close();
        return null; // not found
      }

      const existingParentIds = this.decodeIdArray(currentRes.rows[0].INHERITED_FROM_ROLES);
      const currentExplicitPrivilegeIds = this.decodeIdArray(currentRes.rows[0].FUNCTION_PRIVILEGES);

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

      // parents
      let newParentIds = existingParentIds;
      let inheritedFromChanged = false;

      if (inheritedFromRoles !== undefined) {
        inheritedFromChanged = true;
        newParentIds = Array.isArray(inheritedFromRoles)
          ? inheritedFromRoles
              .map(v => (typeof v === 'number' ? v : parseInt(v, 10)))
              .filter(v => !isNaN(v))
          : [];

        const encodedInheritedFrom = this.encodeIdArray(newParentIds);
        updates.push('INHERITED_FROM_ROLES = :inheritedFromRoles');
        binds.inheritedFromRoles = encodedInheritedFrom;
      }

      // explicit privileges
      if (functionPrivileges !== undefined) {
        // Validate: prevent removing inherited privileges
        const parentIdsForValidation = inheritedFromChanged ? newParentIds : existingParentIds;
        const currentInheritedPrivilegeIds = await this.collectPrivilegesFromParents(parentIdsForValidation);
        
        const newExplicitIds = Array.isArray(functionPrivileges)
          ? functionPrivileges
              .map(v => {
                if (typeof v === 'number') return v;
                if (typeof v === 'object' && v.privilege_id) return v.privilege_id;
                if (typeof v === 'object' && v.PRIVILEGE_ID) return v.PRIVILEGE_ID;
                return parseInt(v, 10);
              })
              .filter(v => !isNaN(v))
          : [];
        
        const newEffectiveIds = [...new Set([...newExplicitIds, ...currentInheritedPrivilegeIds])];
        
        const removedInheritedIds = currentInheritedPrivilegeIds.filter(
          id => !newEffectiveIds.includes(id)
        );
        
        if (removedInheritedIds.length > 0) {
          await connection.close();
          throw new Error(
            `Cannot remove inherited privilege(s): ${removedInheritedIds.join(', ')}. Inherited privileges cannot be removed.`
          );
        }
        
        const encodedPrivileges = this.encodeFunctionPrivileges(functionPrivileges || []);
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

      updates.push('UPDATED_AT = SYSTIMESTAMP');
      updates.push('UPDATED_BY = :updatedBy');
      binds.updatedBy = updatedBy;

      const updateQuery = `
        UPDATE SEC.DUTY_ROLES 
           SET ${updates.join(', ')}
         WHERE DUTY_ROLE_ID = :dutyRoleId
      `;

      const result = await connection.execute(updateQuery, binds, { autoCommit: false });

      if (result.rowsAffected === 0) {
        await connection.rollback();
        await connection.close();
        return null;
      }

      // sync parents' INHERITED_CHILD_ROLES arrays if parents changed
      if (inheritedFromChanged) {
        const parentsToAdd = newParentIds.filter(id => !existingParentIds.includes(id));
        const parentsToRemove = existingParentIds.filter(id => !newParentIds.includes(id));

        // ensure all current parents contain this child
        for (const parentId of newParentIds) {
          const parentRes = await connection.execute(
            `SELECT INHERITED_CHILD_ROLES
               FROM SEC.DUTY_ROLES
              WHERE DUTY_ROLE_ID = :parentId`,
            { parentId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );

          if (parentRes.rows.length === 0) continue;

          const existingChildrenEncoded = parentRes.rows[0].INHERITED_CHILD_ROLES;
          const existingChildrenIds = this.decodeIdArray(existingChildrenEncoded);

          if (!existingChildrenIds.includes(dutyRoleId)) {
            const newChildrenIds = [...existingChildrenIds, dutyRoleId];
            const encodedChildren = this.encodeIdArray(newChildrenIds);

            await connection.execute(
              `UPDATE SEC.DUTY_ROLES
                  SET INHERITED_CHILD_ROLES = :inheritedChildRoles,
                      UPDATED_AT = SYSTIMESTAMP
                WHERE DUTY_ROLE_ID = :parentId`,
              {
                inheritedChildRoles: encodedChildren,
                parentId
              },
              { autoCommit: false }
            );
          }
        }

        // remove this child from removed parents
        for (const parentId of parentsToRemove) {
          const parentRes = await connection.execute(
            `SELECT INHERITED_CHILD_ROLES
               FROM SEC.DUTY_ROLES
              WHERE DUTY_ROLE_ID = :parentId`,
            { parentId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );

          if (parentRes.rows.length === 0) continue;

          const existingChildrenEncoded = parentRes.rows[0].INHERITED_CHILD_ROLES;
          const existingChildrenIds = this.decodeIdArray(existingChildrenEncoded);

          if (existingChildrenIds.includes(dutyRoleId)) {
            const newChildrenIds = existingChildrenIds.filter(id => id !== dutyRoleId);
            const encodedChildren = this.encodeIdArray(newChildrenIds);

            await connection.execute(
              `UPDATE SEC.DUTY_ROLES
                  SET INHERITED_CHILD_ROLES = :inheritedChildRoles,
                      UPDATED_AT = SYSTIMESTAMP
                WHERE DUTY_ROLE_ID = :parentId`,
              {
                inheritedChildRoles: encodedChildren,
                parentId
              },
              { autoCommit: false }
            );
          }
        }
      }

      await connection.commit();
      await connection.close();

      return await this.getById(dutyRoleId);
    } catch (error) {
      try { await connection.rollback(); } catch (_) {}
      await connection.close();
      throw error;
    }
  }

  /**
   * Delete a duty role
   *
   * Behavior:
   * - NOT allowed if this role has parents (check INHERITED_FROM_ROLES column).
   * - If this role is a parent:
   *    • children with ONLY this parent  → deleted (cascade one level)
   *    • children with multiple parents → keep, remove this parent from their INHERITED_FROM_ROLES
   * - Remove this role from all parents' INHERITED_CHILD_ROLES arrays.
   */
  static async delete(dutyRoleId) {
    const connection = await getConnection();

    try {
      // Confirm role exists and check if it has parents
      const existsResult = await connection.execute(
        `SELECT DUTY_ROLE_ID, INHERITED_FROM_ROLES
           FROM SEC.DUTY_ROLES
          WHERE DUTY_ROLE_ID = :dutyRoleId`,
        { dutyRoleId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (existsResult.rows.length === 0) {
        await connection.close();
        return false;
      }

      // Check if this role has parents - prevent deletion if yes
      const currentParentIds = this.decodeIdArray(existsResult.rows[0].INHERITED_FROM_ROLES);
      if (currentParentIds.length > 0) {
        try {
          await connection.close();
        } catch (closeError) {}
        throw new Error(
          `Cannot delete duty role ${dutyRoleId} because it inherits from other role(s): ${currentParentIds.join(', ')}. Delete all parent roles first.`
        );
      }

      // 1) Handle children (roles that inherit FROM this role)
      const childrenResult = await connection.execute(
        `SELECT DUTY_ROLE_ID, INHERITED_FROM_ROLES
           FROM SEC.DUTY_ROLES
          WHERE INHERITED_FROM_ROLES IS NOT NULL`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const childrenToDelete = [];

      for (const row of childrenResult.rows) {
        const childId = row.DUTY_ROLE_ID;
        const parentIds = this.decodeIdArray(row.INHERITED_FROM_ROLES);

        if (!parentIds.includes(dutyRoleId)) continue;

        const newParents = parentIds.filter(id => id !== dutyRoleId);

        if (newParents.length === 0) {
          childrenToDelete.push(childId);
        } else {
          const encodedParents = this.encodeIdArray(newParents);

          await connection.execute(
            `UPDATE SEC.DUTY_ROLES
                SET INHERITED_FROM_ROLES = :inheritedFromRoles,
                    UPDATED_AT = SYSTIMESTAMP
              WHERE DUTY_ROLE_ID = :childId`,
            {
              inheritedFromRoles: encodedParents,
              childId
            },
            { autoCommit: false }
          );
        }
      }

      // 2) Remove this role from all parents' INHERITED_CHILD_ROLES arrays
      const parentsResult = await connection.execute(
        `SELECT DUTY_ROLE_ID, INHERITED_CHILD_ROLES
           FROM SEC.DUTY_ROLES
          WHERE INHERITED_CHILD_ROLES IS NOT NULL`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      for (const row of parentsResult.rows) {
        const parentId = row.DUTY_ROLE_ID;
        const childIds = this.decodeIdArray(row.INHERITED_CHILD_ROLES);

        if (!childIds.includes(dutyRoleId)) continue;

        const newChildren = childIds.filter(id => id !== dutyRoleId);
        const encodedChildren = this.encodeIdArray(newChildren);

        await connection.execute(
          `UPDATE SEC.DUTY_ROLES
              SET INHERITED_CHILD_ROLES = :inheritedChildRoles,
                  UPDATED_AT = SYSTIMESTAMP
            WHERE DUTY_ROLE_ID = :parentId`,
          {
            inheritedChildRoles: encodedChildren,
            parentId
          },
          { autoCommit: false }
        );
      }

      // 3) Cascade delete children that only had this parent
      for (const childId of childrenToDelete) {
        await connection.execute(
          `DELETE FROM SEC.DUTY_ROLES
            WHERE DUTY_ROLE_ID = :childId`,
          { childId },
          { autoCommit: false }
        );
      }

      // 4) Delete this role
      const deleteResult = await connection.execute(
        `DELETE FROM SEC.DUTY_ROLES
          WHERE DUTY_ROLE_ID = :dutyRoleId`,
        { dutyRoleId },
        { autoCommit: false }
      );

      const deleted = deleteResult.rowsAffected > 0;

      await connection.commit();
      await connection.close();
      return deleted;
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {}
        try {
          await connection.close();
        } catch (closeError) {}
      }
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
        `SELECT FUNCTION_PRIVILEGES, INHERITED_FROM_ROLES
           FROM SEC.DUTY_ROLES
          WHERE DUTY_ROLE_ID = :dutyRoleId`,
        { dutyRoleId }
      );

      if (currentRole.rows.length === 0) {
        await connection.close();
        return null; // Duty role not found
      }

      // Get existing privilege IDs
      const existingEncoded = currentRole.rows[0].FUNCTION_PRIVILEGES;
      const existingIds = this.decodeIdArray(existingEncoded);
      
      // Check if this privilege is inherited
      const parentIds = this.decodeIdArray(currentRole.rows[0].INHERITED_FROM_ROLES);
      const inheritedPrivilegeIds = await this.collectPrivilegesFromParents(parentIds);
      
      if (inheritedPrivilegeIds.includes(privilegeId)) {
        await connection.close();
        throw new Error(
          `Cannot remove privilege ${privilegeId} because it is inherited from parent role(s). Inherited privileges cannot be removed.`
        );
      }

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
      const encodedPrivileges = this.encodeIdArray(filteredIds);

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

