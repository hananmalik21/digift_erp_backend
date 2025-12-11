import { executeQuery, getConnection } from '../../config/db.js';
import oracledb from 'oracledb';

/**
 * Job Role Model - Database operations for SEC.JOB_ROLES table
 *
 * Important design:
 *  - SEC.JOB_ROLES.DUTY_ROLES    = EXPLICIT duty role IDs only (JSON array of IDs)
 *  - INHERITED_FROM              = array of parent job role IDs (JSON array of IDs)
 *  - INHERITED                   = array of child job role IDs (JSON array of IDs)
 *
 *  Effective duty roles = explicit DUTY_ROLES + all duty roles of parents (recursively).
 */
export class JobRoleModel {
  /**
   * Helper: decode various stored formats into clean array of numeric IDs
   * Works for INHERITED_FROM / INHERITED / DUTY_ROLES and generic ID lists.
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
          // Try JSON string first: "[1,2,3]"
          value = JSON.parse(value);
        } catch (e) {
          // Fallback: "1,2,3"
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
   * (Used for INHERITED_FROM / INHERITED / DUTY_ROLES)
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
   * Encode duty roles (explicit) to DB format (JSON ID array)
   */
  static encodeDutyRoles(dutyRoles) {
    if (!dutyRoles || !Array.isArray(dutyRoles) || dutyRoles.length === 0) {
      return null;
    }

    const ids = dutyRoles
      .map(dr => {
        if (typeof dr === 'number') return dr;
        if (dr && typeof dr === 'object') {
          return (
            dr.duty_role_id ||
            dr.DUTY_ROLE_ID ||
            dr.dutyRoleId ||
            dr.id
          );
        }
        return parseInt(dr, 10);
      })
      .filter(id => !isNaN(id));

    return this.encodeIdArray(ids);
  }

  /**
   * Helper: fetch duty roles by IDs (only 3 fields)
   * @param {number[]} idList
   * @returns {Promise<Array<{duty_role_id:number, duty_role_name:string, role_code:string}>>}
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
      SELECT DUTY_ROLE_ID, DUTY_ROLE_NAME, ROLE_CODE
        FROM SEC.DUTY_ROLES
       WHERE DUTY_ROLE_ID IN (${placeholders})
       ORDER BY DUTY_ROLE_ID
    `;

    const result = await executeQuery(sql, binds);

    return result.rows.map(row => ({
      duty_role_id: row.DUTY_ROLE_ID,
      duty_role_name: row.DUTY_ROLE_NAME,
      role_code: row.ROLE_CODE
    }));
  }

  /**
   * Helper: recursively collect ALL duty role IDs from parents and their parents.
   * @param {number[]} parentIds
   * @param {Set<number>} visited
   * @returns {Promise<number[]>}
   */
  static async collectDutyRolesFromParents(parentIds, visited = new Set()) {
    if (!parentIds || parentIds.length === 0) return [];

    const uniqueParentIds = [...new Set(parentIds)].filter(
      id => !isNaN(id) && !visited.has(id)
    );
    if (uniqueParentIds.length === 0) return [];

    // mark visited to avoid cycles
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
      SELECT JOB_ROLE_ID, DUTY_ROLES, INHERITED_FROM
        FROM SEC.JOB_ROLES
       WHERE JOB_ROLE_ID IN (${placeholders})
    `;

    try {
      const result = await executeQuery(sql, binds);
      const allDutyRoleIds = new Set();

      if (!result || !result.rows || result.rows.length === 0) {
        return [];
      }

      for (const row of result.rows) {
        // explicit duty roles on this parent
        if (row.DUTY_ROLES) {
          const explicitIds = this.decodeIdArray(row.DUTY_ROLES);
          explicitIds.forEach(id => allDutyRoleIds.add(id));
        }

        // recursively from parent's parents
        if (row.INHERITED_FROM) {
          const grandParentIds = this.decodeIdArray(row.INHERITED_FROM);
          if (grandParentIds.length > 0) {
            const grandParentDutyRoles = await this.collectDutyRolesFromParents(
              grandParentIds,
              visited
            );
            grandParentDutyRoles.forEach(id => allDutyRoleIds.add(id));
          }
        }
      }

      return Array.from(allDutyRoleIds);
    } catch (error) {
      console.error('Error in collectDutyRolesFromParents:', error);
      console.error('Parent IDs:', parentIds);
      throw error;
    }
  }

  /**
   * Helper: fetch job roles by IDs (for inherited_from / inherited display)
   * Returns minimal fields.
   */
  static async fetchJobRolesByIds(idList) {
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
      SELECT JOB_ROLE_ID, JOB_ROLE_CODE, JOB_ROLE_NAME, STATUS
        FROM SEC.JOB_ROLES
       WHERE JOB_ROLE_ID IN (${placeholders})
       ORDER BY JOB_ROLE_ID
    `;

    const result = await executeQuery(sql, binds);

    return result.rows.map(row => ({
      job_role_id: row.JOB_ROLE_ID,
      job_role_code: row.JOB_ROLE_CODE,
      job_role_name: row.JOB_ROLE_NAME,
      status: row.STATUS
    }));
  }

  /**
   * Decode INHERITED_FROM / INHERITED (job role references) to minimal job role objects.
   */
  static async decodeJobRoleArray(encodedValue) {
    if (!encodedValue) return [];

    try {
      let value = encodedValue;

      if (typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch (e) {
          // "1,2,3"
          const idList = value
            .split(',')
            .map(id => parseInt(id.trim(), 10))
            .filter(id => !isNaN(id));

          if (idList.length === 0) return [];
          return await this.fetchJobRolesByIds(idList);
        }
      }

      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
        return value
          .map(jr => ({
            job_role_id:
              jr.job_role_id ??
              jr.JOB_ROLE_ID ??
              jr.id ??
              null,
            job_role_code:
              jr.job_role_code ??
              jr.JOB_ROLE_CODE ??
              jr.code ??
              null,
            job_role_name:
              jr.job_role_name ??
              jr.JOB_ROLE_NAME ??
              jr.name ??
              null,
            status:
              jr.status ??
              jr.STATUS ??
              null
          }))
          .filter(jr => jr.job_role_id !== null);
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
        return await this.fetchJobRolesByIds(idList);
      }

      console.error('Unsupported INHERITED_* format:', encodedValue);
      return [];
    } catch (error) {
      console.error('Error decoding job role array:', error, 'value=', encodedValue);
      return [];
    }
  }

  /**
   * Compute EFFECTIVE duty roles:
   *  explicit (this role) + inherited from all parents (recursively).
   *
   * Returns array of duty role objects with an `inherited` flag.
   */
  static async computeEffectiveDutyRoles(row) {
    try {
      // Handle both uppercase (Oracle default) and lowercase column names
      const dutyRolesRaw = row.DUTY_ROLES || row.duty_roles || null;
      const inheritedFromRaw = row.INHERITED_FROM || row.inherited_from || null;
      
      const explicitIds = this.decodeIdArray(dutyRolesRaw);
      const parentIds = this.decodeIdArray(inheritedFromRaw);
      
      // Collect inherited duty roles from all parents (recursively)
      const inheritedIds = await this.collectDutyRolesFromParents(parentIds);

      // Merge explicit + inherited (deduplicate)
      const allIds = [...new Set([...explicitIds, ...inheritedIds])];

      if (allIds.length === 0) return [];
      
      // Fetch full duty role objects
      const dutyRoles = await this.fetchDutyRolesByIds(allIds);
      
      // Add inherited flag to each duty role
      // A duty role is inherited if it comes from a parent (even if also explicitly assigned)
      const inheritedIdsSet = new Set(inheritedIds);
      
      return dutyRoles.map(dr => ({
        ...dr,
        inherited: inheritedIdsSet.has(dr.duty_role_id)
      }));
    } catch (error) {
      console.error('Error in computeEffectiveDutyRoles:', error);
      console.error('Row data:', { 
        JOB_ROLE_ID: row.JOB_ROLE_ID || row.job_role_id,
        DUTY_ROLES: row.DUTY_ROLES || row.duty_roles, 
        INHERITED_FROM: row.INHERITED_FROM || row.inherited_from 
      });
      // Return at least explicit duty roles if computation fails
      const dutyRolesRaw = row.DUTY_ROLES || row.duty_roles || null;
      const explicitIds = this.decodeIdArray(dutyRolesRaw);
      if (explicitIds.length === 0) return [];
      const dutyRoles = await this.fetchDutyRolesByIds(explicitIds);
      // Mark all as explicit (inherited: false) since we couldn't compute inherited ones
      return dutyRoles.map(dr => ({
        ...dr,
        inherited: false
      }));
    }
  }

  /**
   * Get all job roles with pagination and search
   */
  static async getAll(page = 1, limit = 10, searchParams = {}) {
    const offset = (page - 1) * limit;
    
    // Build WHERE clause and bind variables
    const conditions = [];
    const searchBinds = {};
    
    if (searchParams.jobRoleId !== undefined && searchParams.jobRoleId !== null) {
      const jobRoleId = parseInt(searchParams.jobRoleId);
      if (!isNaN(jobRoleId)) {
        conditions.push('JOB_ROLE_ID = :jobRoleId');
        searchBinds.jobRoleId = jobRoleId;
      }
    }
    
    if (searchParams.jobRoleCode) {
      conditions.push('UPPER(JOB_ROLE_CODE) LIKE UPPER(:jobRoleCode)');
      searchBinds.jobRoleCode = `%${searchParams.jobRoleCode}%`;
    }
    
    if (searchParams.jobRoleName) {
      conditions.push('UPPER(JOB_ROLE_NAME) LIKE UPPER(:jobRoleName)');
      searchBinds.jobRoleName = `%${searchParams.jobRoleName}%`;
    }
    
    if (searchParams.status) {
      conditions.push('UPPER(STATUS) = UPPER(:status)');
      searchBinds.status = searchParams.status.toUpperCase();
    }
    
    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}`
      : '';
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM SEC.JOB_ROLES ${whereClause}`;
    const countResult = await executeQuery(countQuery, searchBinds);
    const total = countResult.rows[0].TOTAL;
    
    // Activity counts (ignore status filter when counting Active/Inactive)
    const activityConditions = conditions.filter(c => !c.includes('STATUS'));
    const activityWhereClause = activityConditions.length > 0 
      ? `WHERE ${activityConditions.join(' AND ')}`
      : '';
    
    const activeConditions = [...activityConditions, 'UPPER(STATUS) = UPPER(:statusActive)'];
    const inactiveConditions = [...activityConditions, 'UPPER(STATUS) = UPPER(:statusInactive)'];

    const activeWhereClause = `WHERE ${activeConditions.join(' AND ')}`;
    const inactiveWhereClause = `WHERE ${inactiveConditions.join(' AND ')}`;
    
    const activeBindParams = { ...searchBinds };
    delete activeBindParams.status;
    activeBindParams.statusActive = 'ACTIVE';
    
    const inactiveBindParams = { ...searchBinds };
    delete inactiveBindParams.status;
    inactiveBindParams.statusInactive = 'INACTIVE';
    
    const activeCountQuery = `SELECT COUNT(*) as total_active FROM SEC.JOB_ROLES ${activeWhereClause}`;
    const inactiveCountQuery = `SELECT COUNT(*) as total_inactive FROM SEC.JOB_ROLES ${inactiveWhereClause}`;
    
    const activeCountResult = await executeQuery(activeCountQuery, activeBindParams);
    const inactiveCountResult = await executeQuery(inactiveCountQuery, inactiveBindParams);
    
    const totalActive = activeCountResult.rows[0].TOTAL_ACTIVE;
    const totalInactive = inactiveCountResult.rows[0].TOTAL_INACTIVE;
    
    // Get paginated data
    const dataBinds = { ...searchBinds, offset, limit };
    const dataQuery = `
      SELECT * FROM SEC.JOB_ROLES 
      ${whereClause}
      ORDER BY JOB_ROLE_ID 
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
    `;
    const dataResult = await executeQuery(dataQuery, dataBinds);
    
    // Decode effective duty roles + inherited_from + inherited for each record
    const dataWithDecoded = await Promise.all(
      dataResult.rows.map(async (row) => {
        const effectiveDutyRoles = await this.computeEffectiveDutyRoles(row);
        const decodedInheritedFrom = await this.decodeJobRoleArray(row.INHERITED_FROM);
        const decodedInherited = await this.decodeJobRoleArray(row.INHERITED);

        return {
          ...row,
          DUTY_ROLES_DECODED: effectiveDutyRoles,
          INHERITED_FROM_DECODED: decodedInheritedFrom,
          INHERITED_DECODED: decodedInherited
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
   * Get all job roles without pagination (for dropdowns)
   */
  static async getAllForDropdown(searchParams = {}) {
    const conditions = [];
    const searchBinds = {};
    
    const status = searchParams.status || 'ACTIVE';
    conditions.push('UPPER(STATUS) = UPPER(:status)');
    searchBinds.status = status.toUpperCase();
    
    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    
    const dataQuery = `
      SELECT * FROM SEC.JOB_ROLES 
      ${whereClause}
      ORDER BY JOB_ROLE_NAME
    `;
    const dataResult = await executeQuery(dataQuery, searchBinds);
    
    return dataResult.rows;
  }

  /**
   * Get job role by ID
   */
  static async getById(jobRoleId) {
    const result = await executeQuery(
      'SELECT * FROM SEC.JOB_ROLES WHERE JOB_ROLE_ID = :jobRoleId',
      { jobRoleId }
    );
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    const effectiveDutyRoles = await this.computeEffectiveDutyRoles(row);
    const decodedInheritedFrom = await this.decodeJobRoleArray(row.INHERITED_FROM);
    const decodedInherited = await this.decodeJobRoleArray(row.INHERITED);

    return {
      ...row,
      DUTY_ROLES_DECODED: effectiveDutyRoles,
      INHERITED_FROM_DECODED: decodedInheritedFrom,
      INHERITED_DECODED: decodedInherited
    };
  }

  /**
   * Create a new job role
   * - DUTY_ROLES column stores only EXPLICIT duty role IDs.
   * - INHERITED_FROM sets parents.
   * - Parents' INHERITED is updated to include this child.
   */
  static async create(jobRoleData) {
    const connection = await getConnection();
    try {
      const {
        jobRoleCode,
        jobRoleName,
        description,
        dutyRolesArray,     // explicit duty roles
        inheritedFromArray, // parents of this role
        status = 'ACTIVE',
        createdBy = 'SYSTEM'
      } = jobRoleData;

      if (!jobRoleCode || !jobRoleName) {
        throw new Error('jobRoleCode and jobRoleName are required');
      }

      // normalize parents
      const parentIds = Array.isArray(inheritedFromArray)
        ? inheritedFromArray
            .map(v => (typeof v === 'number' ? v : parseInt(v, 10)))
            .filter(v => !isNaN(v))
        : [];

      // explicit duty roles only
      const encodedDutyRoles = this.encodeDutyRoles(dutyRolesArray || []);

      const encodedInheritedFrom =
        parentIds.length > 0 ? this.encodeIdArray(parentIds) : null;

      const columns = [
        'JOB_ROLE_CODE',
        'JOB_ROLE_NAME',
        'DESCRIPTION',
        'STATUS',
        'CREATED_BY',
        'CREATED_AT'
      ];
      const values = [
        ':jobRoleCode',
        ':jobRoleName',
        ':description',
        ':status',
        ':createdBy',
        'SYSTIMESTAMP'
      ];
      const binds = {
        jobRoleCode,
        jobRoleName,
        description: description || null,
        status,
        createdBy,
        jobRoleId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
      };

      if (encodedDutyRoles !== null) {
        columns.splice(3, 0, 'DUTY_ROLES'); // after DESCRIPTION
        values.splice(3, 0, ':dutyRoles');
        binds.dutyRoles = encodedDutyRoles;
      }

      if (encodedInheritedFrom !== null) {
        columns.splice(3, 0, 'INHERITED_FROM'); // after DESCRIPTION
        values.splice(3, 0, ':inheritedFrom');
        binds.inheritedFrom = encodedInheritedFrom;
      }

      const result = await connection.execute(
        `INSERT INTO SEC.JOB_ROLES (
          ${columns.join(', ')}
        ) VALUES (
          ${values.join(', ')}
        )
        RETURNING JOB_ROLE_ID INTO :jobRoleId`,
        binds,
        { autoCommit: false }
      );

      const jobRoleId = result.outBinds.jobRoleId[0];

      // sync: add this child to each parent's INHERITED list
      for (const parentId of parentIds) {
        const parentRes = await connection.execute(
          `SELECT INHERITED
             FROM SEC.JOB_ROLES
            WHERE JOB_ROLE_ID = :parentId`,
          { parentId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (parentRes.rows.length === 0) continue;

        const existingChildrenEncoded = parentRes.rows[0].INHERITED;
        const existingChildrenIds = this.decodeIdArray(existingChildrenEncoded);

        if (!existingChildrenIds.includes(jobRoleId)) {
          const newChildrenIds = [...existingChildrenIds, jobRoleId];
          const encodedChildren = this.encodeIdArray(newChildrenIds);

          await connection.execute(
            `UPDATE SEC.JOB_ROLES
                SET INHERITED  = :inherited,
                    UPDATED_AT = SYSTIMESTAMP
              WHERE JOB_ROLE_ID = :parentId`,
            {
              inherited: encodedChildren,
              parentId
            },
            { autoCommit: false }
          );
        }
      }

      await connection.commit();
      await connection.close();
      
      return await this.getById(jobRoleId);
    } catch (error) {
      try { await connection.rollback(); } catch (_) {}
      await connection.close();
      throw error;
    }
  }

  /**
   * Update a job role
   * - dutyRolesArray modifies only EXPLICIT duty roles.
   * - inheritedFromArray modifies parent links and keeps INHERITED in sync.
   * - effective duty roles are computed at read-time.
   */
  static async update(jobRoleId, jobRoleData) {
    const connection = await getConnection();
    try {
      const {
        jobRoleCode,
        jobRoleName,
        description,
        dutyRolesArray,     // explicit
        inheritedFromArray, // parents
        status,
        updatedBy = 'SYSTEM'
      } = jobRoleData;

      // get current parents and explicit duty roles for validation
      const currentRes = await connection.execute(
        `SELECT INHERITED_FROM, DUTY_ROLES
           FROM SEC.JOB_ROLES
          WHERE JOB_ROLE_ID = :jobRoleId`,
        { jobRoleId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (currentRes.rows.length === 0) {
        await connection.close();
        return null; // not found
      }

      const existingParentIds = this.decodeIdArray(currentRes.rows[0].INHERITED_FROM);
      const currentExplicitDutyRoleIds = this.decodeIdArray(currentRes.rows[0].DUTY_ROLES);

      const updates = [];
      const binds = { jobRoleId };

      if (jobRoleCode !== undefined) {
        updates.push('JOB_ROLE_CODE = :jobRoleCode');
        binds.jobRoleCode = jobRoleCode;
      }

      if (jobRoleName !== undefined) {
        updates.push('JOB_ROLE_NAME = :jobRoleName');
        binds.jobRoleName = jobRoleName;
      }

      if (description !== undefined) {
        updates.push('DESCRIPTION = :description');
        binds.description = description;
      }

      // parents
      let newParentIds = existingParentIds;
      let inheritedFromChanged = false;

      if (inheritedFromArray !== undefined) {
        inheritedFromChanged = true;
        newParentIds = Array.isArray(inheritedFromArray)
          ? inheritedFromArray
              .map(v => (typeof v === 'number' ? v : parseInt(v, 10)))
              .filter(v => !isNaN(v))
          : [];

        const encodedInheritedFrom = this.encodeIdArray(newParentIds);
        updates.push('INHERITED_FROM = :inheritedFrom');
        binds.inheritedFrom = encodedInheritedFrom;
      }

      // explicit duty roles
      if (dutyRolesArray !== undefined) {
        // Validate: prevent removing inherited duty roles
        // Use new parent IDs if inheritedFromArray was provided, otherwise use existing
        const parentIdsForValidation = inheritedFromChanged ? newParentIds : existingParentIds;
        const currentInheritedDutyRoleIds = await this.collectDutyRolesFromParents(parentIdsForValidation);
        
        // Calculate what the new effective duty roles would be
        const newExplicitIds = Array.isArray(dutyRolesArray)
          ? dutyRolesArray
              .map(v => {
                if (typeof v === 'number') return v;
                if (typeof v === 'object' && v.duty_role_id) return v.duty_role_id;
                if (typeof v === 'object' && v.DUTY_ROLE_ID) return v.DUTY_ROLE_ID;
                return parseInt(v, 10);
              })
              .filter(v => !isNaN(v))
          : [];
        
        // New effective = new explicit + inherited from new/existing parents
        const newEffectiveIds = [...new Set([...newExplicitIds, ...currentInheritedDutyRoleIds])];
        
        // Check if any currently inherited duty roles are missing from new effective
        const removedInheritedIds = currentInheritedDutyRoleIds.filter(
          id => !newEffectiveIds.includes(id)
        );
        
        if (removedInheritedIds.length > 0) {
          await connection.close();
          throw new Error(
            `Cannot remove inherited duty role(s): ${removedInheritedIds.join(', ')}. Inherited duty roles cannot be removed.`
          );
        }
        
        const encodedDutyRoles = this.encodeDutyRoles(dutyRolesArray || []);
        updates.push('DUTY_ROLES = :dutyRoles');
        binds.dutyRoles = encodedDutyRoles;
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
        UPDATE SEC.JOB_ROLES 
           SET ${updates.join(', ')}
         WHERE JOB_ROLE_ID = :jobRoleId
      `;

      const result = await connection.execute(updateQuery, binds, { autoCommit: false });

      if (result.rowsAffected === 0) {
        await connection.rollback();
        await connection.close();
        return null;
      }

      // sync parents' INHERITED arrays if parents changed
      if (inheritedFromChanged) {
        const parentsToAdd = newParentIds.filter(id => !existingParentIds.includes(id));
        const parentsToRemove = existingParentIds.filter(id => !newParentIds.includes(id));

        // ensure all current parents contain this child
        for (const parentId of newParentIds) {
          const parentRes = await connection.execute(
            `SELECT INHERITED
               FROM SEC.JOB_ROLES
              WHERE JOB_ROLE_ID = :parentId`,
            { parentId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );

          if (parentRes.rows.length === 0) continue;

          const existingChildrenEncoded = parentRes.rows[0].INHERITED;
          const existingChildrenIds = this.decodeIdArray(existingChildrenEncoded);

          if (!existingChildrenIds.includes(jobRoleId)) {
            const newChildrenIds = [...existingChildrenIds, jobRoleId];
            const encodedChildren = this.encodeIdArray(newChildrenIds);

            await connection.execute(
              `UPDATE SEC.JOB_ROLES
                  SET INHERITED  = :inherited,
                      UPDATED_AT = SYSTIMESTAMP
                WHERE JOB_ROLE_ID = :parentId`,
              {
                inherited: encodedChildren,
                parentId
              },
              { autoCommit: false }
            );
          }
        }

        // remove this child from removed parents
        for (const parentId of parentsToRemove) {
          const parentRes = await connection.execute(
            `SELECT INHERITED
               FROM SEC.JOB_ROLES
              WHERE JOB_ROLE_ID = :parentId`,
            { parentId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );

          if (parentRes.rows.length === 0) continue;

          const existingChildrenEncoded = parentRes.rows[0].INHERITED;
          const existingChildrenIds = this.decodeIdArray(existingChildrenEncoded);

          if (existingChildrenIds.includes(jobRoleId)) {
            const newChildrenIds = existingChildrenIds.filter(id => id !== jobRoleId);
            const encodedChildren = this.encodeIdArray(newChildrenIds);

            await connection.execute(
              `UPDATE SEC.JOB_ROLES
                  SET INHERITED  = :inherited,
                      UPDATED_AT = SYSTIMESTAMP
                WHERE JOB_ROLE_ID = :parentId`,
              {
                inherited: encodedChildren,
                parentId
              },
              { autoCommit: false }
            );
          }
        }
      }

      await connection.commit();
      await connection.close();

      return await this.getById(jobRoleId);
    } catch (error) {
      try { await connection.rollback(); } catch (_) {}
      await connection.close();
      throw error;
    }
  }

  /**
   * Delete a job role
   *
   * Behavior:
   * - NOT allowed if this role has parents (check INHERITED_FROM column).
   * - If this role is a parent:
   *    • children with ONLY this parent  → deleted (cascade one level)
   *    • children with multiple parents → keep, remove this parent from their INHERITED_FROM,
   *      and recalculate their duty roles (remove inherited from deleted parent)
   * - Remove this role from all parents' INHERITED arrays.
   * - Recalculate duty roles for affected children when removing a parent.
   */
  static async delete(jobRoleId) {
    const connection = await getConnection();

    try {
      // Confirm role exists and check if it has parents
      const existsResult = await connection.execute(
        `SELECT JOB_ROLE_ID, INHERITED_FROM
           FROM SEC.JOB_ROLES
          WHERE JOB_ROLE_ID = :jobRoleId`,
        { jobRoleId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (existsResult.rows.length === 0) {
        await connection.close();
        return false;
      }

      // Check if this role has parents - prevent deletion if yes
      const currentParentIds = this.decodeIdArray(existsResult.rows[0].INHERITED_FROM);
      if (currentParentIds.length > 0) {
        // Close connection before throwing error (no transaction started yet)
        try {
          await connection.close();
        } catch (closeError) {
          // Ignore close errors
        }
        throw new Error(
          `Cannot delete job role ${jobRoleId} because it inherits from other role(s): ${currentParentIds.join(', ')}. Delete all parent roles first.`
        );
      }

      // 1) Handle children (roles that inherit FROM this role)
      const childrenResult = await connection.execute(
        `SELECT JOB_ROLE_ID, INHERITED_FROM, DUTY_ROLES
           FROM SEC.JOB_ROLES
          WHERE INHERITED_FROM IS NOT NULL`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const childrenToDelete = [];

      for (const row of childrenResult.rows) {
        const childId = row.JOB_ROLE_ID;
        const parentIds = this.decodeIdArray(row.INHERITED_FROM);

        if (!parentIds.includes(jobRoleId)) continue;

        const newParents = parentIds.filter(id => id !== jobRoleId);

        if (newParents.length === 0) {
          // No parents left → cascade delete
          childrenToDelete.push(childId);
        } else {
          // Multiple parents → keep child, remove this parent and recalculate duty roles
          const encodedParents = this.encodeIdArray(newParents);

          // Get current explicit duty roles
          const currentExplicitIds = this.decodeIdArray(row.DUTY_ROLES);

          // Recalculate duty roles: explicit + inherited from remaining parents only
          const inheritedFromRemaining = await this.collectDutyRolesFromParents(newParents);
          const allDutyRoleIds = [...new Set([...currentExplicitIds, ...inheritedFromRemaining])];
          const encodedDutyRoles = this.encodeIdArray(allDutyRoleIds);

          await connection.execute(
            `UPDATE SEC.JOB_ROLES
                SET INHERITED_FROM = :inheritedFrom,
                    DUTY_ROLES      = :dutyRoles,
                    UPDATED_AT      = SYSTIMESTAMP
              WHERE JOB_ROLE_ID     = :childId`,
            {
              inheritedFrom: encodedParents,
              dutyRoles: encodedDutyRoles,
              childId
            },
            { autoCommit: false }
          );
        }
      }

      // 2) Remove this role from all parents' INHERITED arrays
      const parentsResult = await connection.execute(
        `SELECT JOB_ROLE_ID, INHERITED
           FROM SEC.JOB_ROLES
          WHERE INHERITED IS NOT NULL`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      for (const row of parentsResult.rows) {
        const parentId = row.JOB_ROLE_ID;
        const childIds = this.decodeIdArray(row.INHERITED);

        if (!childIds.includes(jobRoleId)) continue;

        const newChildren = childIds.filter(id => id !== jobRoleId);
        const encodedChildren = this.encodeIdArray(newChildren);

        await connection.execute(
          `UPDATE SEC.JOB_ROLES
              SET INHERITED  = :inherited,
                  UPDATED_AT = SYSTIMESTAMP
            WHERE JOB_ROLE_ID = :parentId`,
          {
            inherited: encodedChildren,
            parentId
          },
          { autoCommit: false }
        );
      }

      // 3) Cascade delete children that only had this parent
      for (const childId of childrenToDelete) {
        await connection.execute(
          `DELETE FROM SEC.JOB_ROLES
            WHERE JOB_ROLE_ID = :childId`,
          { childId },
          { autoCommit: false }
        );
      }

      // 4) Delete this role
      const deleteResult = await connection.execute(
        `DELETE FROM SEC.JOB_ROLES
          WHERE JOB_ROLE_ID = :jobRoleId`,
        { jobRoleId },
        { autoCommit: false }
      );

      const deleted = deleteResult.rowsAffected > 0;

      await connection.commit();
      await connection.close();
      return deleted;
    } catch (error) {
      // Only rollback and close if connection is still open
      // (connection might have been closed before throwing error for validation)
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          // Ignore rollback errors (no transaction or connection already closed)
        }
        try {
          await connection.close();
        } catch (closeError) {
          // Ignore close errors (connection might already be closed)
        }
      }
      throw error;
    }
  }

  /**
   * Add duty roles to a job role (explicit only, additive)
   */
  static async addDutyRolesToJobRole(jobRoleId, dutyRoleIds, updatedBy = 'SYSTEM') {
    const connection = await getConnection();
    try {
      const currentRole = await executeQuery(
        'SELECT DUTY_ROLES FROM SEC.JOB_ROLES WHERE JOB_ROLE_ID = :jobRoleId',
        { jobRoleId }
      );

      if (currentRole.rows.length === 0) {
        await connection.close();
        return null; // not found
      }

      const existingEncoded = currentRole.rows[0].DUTY_ROLES;
      const existingIds = this.decodeIdArray(existingEncoded);

      const newIds = dutyRoleIds
        .map(id => (typeof id === 'number' ? id : parseInt(id, 10)))
        .filter(id => !isNaN(id));

      const alreadyAssignedIds = newIds.filter(id => existingIds.includes(id));
      const newlyAssignedIds = newIds.filter(id => !existingIds.includes(id));

      if (newlyAssignedIds.length === 0) {
        await connection.close();
        const jobRoleData = await this.getById(jobRoleId);
        return {
          jobRoleData,
          alreadyAssignedIds,
          newlyAssignedIds: [],
          wasUpdated: false
        };
      }

      const mergedIds = [...new Set([...existingIds, ...newlyAssignedIds])];
      const encodedDutyRoles = this.encodeIdArray(mergedIds);

      const result = await connection.execute(
        `UPDATE SEC.JOB_ROLES 
           SET DUTY_ROLES = :dutyRoles,
               UPDATED_AT = SYSTIMESTAMP,
               UPDATED_BY = :updatedBy
         WHERE JOB_ROLE_ID = :jobRoleId`,
        {
          dutyRoles: encodedDutyRoles,
          updatedBy,
          jobRoleId
        },
        { autoCommit: true }
      );

      await connection.close();

      if (result.rowsAffected === 0) {
        return null;
      }

      const jobRoleData = await this.getById(jobRoleId);
      return {
        jobRoleData,
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
   * Remove a duty role from a job role (explicit only)
   * Cannot remove inherited duty roles.
   */
  static async removeDutyRoleFromJobRole(jobRoleId, dutyRoleId, updatedBy = 'SYSTEM') {
    const connection = await getConnection();
    try {
      const currentRole = await executeQuery(
        `SELECT DUTY_ROLES, INHERITED_FROM
           FROM SEC.JOB_ROLES
          WHERE JOB_ROLE_ID = :jobRoleId`,
        { jobRoleId }
      );

      if (currentRole.rows.length === 0) {
        await connection.close();
        return null; // not found
      }

      const existingEncoded = currentRole.rows[0].DUTY_ROLES;
      const existingIds = this.decodeIdArray(existingEncoded);
      
      // Check if this duty role is inherited
      const parentIds = this.decodeIdArray(currentRole.rows[0].INHERITED_FROM);
      const inheritedDutyRoleIds = await this.collectDutyRolesFromParents(parentIds);
      
      if (inheritedDutyRoleIds.includes(dutyRoleId)) {
        await connection.close();
        throw new Error(
          `Cannot remove duty role ${dutyRoleId} because it is inherited from parent role(s). Inherited duty roles cannot be removed.`
        );
      }

      if (!existingIds.includes(dutyRoleId)) {
        await connection.close();
        const jobRoleData = await this.getById(jobRoleId);
        return {
          jobRoleData,
          wasRemoved: false,
          wasUpdated: false
        };
      }

      const filteredIds = existingIds.filter(id => id !== dutyRoleId);
      const encodedDutyRoles = this.encodeIdArray(filteredIds);

      const result = await connection.execute(
        `UPDATE SEC.JOB_ROLES 
           SET DUTY_ROLES = :dutyRoles,
               UPDATED_AT = SYSTIMESTAMP,
               UPDATED_BY = :updatedBy
         WHERE JOB_ROLE_ID = :jobRoleId`,
        {
          dutyRoles: encodedDutyRoles,
          updatedBy,
          jobRoleId
        },
        { autoCommit: true }
      );

      await connection.close();

      if (result.rowsAffected === 0) {
        return null;
      }

      const jobRoleData = await this.getById(jobRoleId);
      return {
        jobRoleData,
        wasRemoved: true,
        wasUpdated: true
      };
    } catch (error) {
      await connection.close();
      throw error;
    }
  }
}
