import { DutyRoleModel } from './model.js';
import { DutyRoleView } from './view.js';

/**
 * Duty Role Controller - Handles HTTP requests for duty roles
 */
export class DutyRoleController {
  /**
   * Get all duty roles with pagination and search
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getAll(req, res) {
    try {
      // Parse query parameters
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      
      // Parse search parameters
      const searchParams = {};
      if (req.query.dutyRoleId !== undefined) {
        const dutyRoleId = parseInt(req.query.dutyRoleId);
        if (isNaN(dutyRoleId)) {
          // Return empty data for invalid dutyRoleId
          return res.json(DutyRoleView.formatPaginatedResponse({
            data: [],
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 0
          }));
        }
        searchParams.dutyRoleId = dutyRoleId;
      }
      if (req.query.dutyRoleName) {
        searchParams.dutyRoleName = req.query.dutyRoleName;
      }
      if (req.query.roleCode) {
        searchParams.roleCode = req.query.roleCode;
      }
      if (req.query.moduleId !== undefined) {
        const moduleId = parseInt(req.query.moduleId);
        if (isNaN(moduleId)) {
          // Return empty data for invalid moduleId
          return res.json(DutyRoleView.formatPaginatedResponse({
            data: [],
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 0
          }));
        }
        searchParams.moduleId = moduleId;
      }
      
      // General search parameter - searches across duty role name, role code, description, and module name
      if (req.query.search) {
        searchParams.search = req.query.search;
      }
      
      if (req.query.status) {
        const statusUpper = req.query.status.toUpperCase();
        if (['ACTIVE', 'INACTIVE'].includes(statusUpper)) {
          searchParams.status = statusUpper;
        } else {
          return res.status(400).json(
            DutyRoleView.formatErrorResponse('status must be ACTIVE or INACTIVE', 400)
          );
        }
      }
      
      // Validate pagination parameters
      if (page < 1) {
        return res.status(400).json(
          DutyRoleView.formatErrorResponse('Page number must be greater than 0', 400)
        );
      }
      
      if (limit < 1 || limit > 1000) {
        return res.status(400).json(
          DutyRoleView.formatErrorResponse('Limit must be between 1 and 1000', 400)
        );
      }
      
      // Get data from model
      const result = await DutyRoleModel.getAll(page, limit, searchParams);
      
      // Format and send response
      res.json(DutyRoleView.formatPaginatedResponse(result));
    } catch (error) {
      // If there's a type error (NaN), return empty data instead of error
      if (error.code === 'NJS-105' || error.message.includes('NaN') || error.message.includes('not a number')) {
        return res.json(DutyRoleView.formatPaginatedResponse({
          data: [],
          total: 0,
          page: parseInt(req.query.page) || 1,
          limit: parseInt(req.query.limit) || 10,
          totalPages: 0
        }));
      }
      
      res.status(500).json(
        DutyRoleView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Get duty role by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getById(req, res) {
    try {
      const dutyRoleId = parseInt(req.params.id);
      
      if (isNaN(dutyRoleId)) {
        return res.status(400).json(
          DutyRoleView.formatErrorResponse('Invalid duty role ID', 400)
        );
      }
      
      const dutyRoleData = await DutyRoleModel.getById(dutyRoleId);
      
      if (!dutyRoleData) {
        return res.status(404).json(
          DutyRoleView.formatErrorResponse('Duty role not found', 404)
        );
      }
      
      res.json(DutyRoleView.formatSingleResponse(dutyRoleData));
    } catch (error) {
      res.status(500).json(
        DutyRoleView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Create a new duty role
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
static async create(jobRoleData) {
  const connection = await getConnection();
  try {
    const {
      jobRoleCode,
      jobRoleName,
      description,
      dutyRolesArray,
      status,              // ❗ no default here
      createdBy = 'SYSTEM',
      isSystemRole = 'N',  // if you're using this, else you can omit
    } = jobRoleData;

    if (!jobRoleCode || !jobRoleName) {
      throw new Error('jobRoleCode and jobRoleName are required');
    }

    // 🔵 Normalize STATUS to exactly 'Active' / 'Inactive'
    let normalizedStatus;
    if (!status) {
      // use DB default behaviour: 'Active'
      normalizedStatus = 'Active';
    } else {
      const upper = status.toUpperCase();
      if (upper === 'ACTIVE') normalizedStatus = 'Active';
      else if (upper === 'INACTIVE') normalizedStatus = 'Inactive';
      else throw new Error('Invalid status value'); // should never happen due to controller validation
    }

    // 🔵 Normalize IS_SYSTEM_ROLE to 'N' / 'Y'
    const normalizedIsSystemRole = (isSystemRole || 'N').toUpperCase() === 'Y' ? 'Y' : 'N';

    const encodedDutyRoles = dutyRolesArray ? this.encodeDutyRoles(dutyRolesArray) : null;

    const columns = [
      'JOB_ROLE_CODE',
      'JOB_ROLE_NAME',
      'DESCRIPTION',
      'DEPARTMENT',
      'STATUS',
      'IS_SYSTEM_ROLE',
      'CREATED_BY',
      'CREATED_AT'
    ];
    const values = [
      ':jobRoleCode',
      ':jobRoleName',
      ':description',
      ':department',
      ':status',
      ':isSystemRole',
      ':createdBy',
      'SYSDATE'
    ];
    const binds = {
      jobRoleCode,
      jobRoleName,
      description: description || null,
      department: null,            // or from jobRoleData if you use it
      status: normalizedStatus,    // ✅ matches constraint
      isSystemRole: normalizedIsSystemRole,
      createdBy,
      jobRoleId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
    };

    if (encodedDutyRoles !== null) {
      columns.push('DUTY_ROLES');
      values.push(':dutyRoles');
      binds.dutyRoles = encodedDutyRoles;
    }

    const result = await connection.execute(
      `INSERT INTO SEC.JOB_ROLES (
        ${columns.join(', ')}
      ) VALUES (
        ${values.join(', ')}
      )
      RETURNING JOB_ROLE_ID INTO :jobRoleId`,
      binds,
      { autoCommit: true }
    );

    const jobRoleId = result.outBinds.jobRoleId[0];
    await connection.close();

    return await this.getById(jobRoleId);
  } catch (error) {
    await connection.close();
    throw error;
  }
}




  /**
   * Update a duty role
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
static async update(jobRoleId, jobRoleData) {
  const connection = await getConnection();
  try {
    const {
      jobRoleCode,
      jobRoleName,
      description,
      dutyRolesArray,
      status,
      updatedBy = 'SYSTEM',
      isSystemRole,
    } = jobRoleData;

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

    if (dutyRolesArray !== undefined) {
      const encodedDutyRoles = this.encodeDutyRoles(dutyRolesArray);
      updates.push('DUTY_ROLES = :dutyRoles');
      binds.dutyRoles = encodedDutyRoles;
    }

    if (status !== undefined) {
      const upper = status.toUpperCase();
      let normalizedStatus = null;
      if (upper === 'ACTIVE') normalizedStatus = 'Active';
      else if (upper === 'INACTIVE') normalizedStatus = 'Inactive';
      else throw new Error('Invalid status value');

      updates.push('STATUS = :status');
      binds.status = normalizedStatus;
    }

    if (isSystemRole !== undefined) {
      const normalizedIsSystemRole = isSystemRole.toUpperCase() === 'Y' ? 'Y' : 'N';
      updates.push('IS_SYSTEM_ROLE = :isSystemRole');
      binds.isSystemRole = normalizedIsSystemRole;
    }

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    updates.push('UPDATED_AT = SYSDATE');
    updates.push('UPDATED_BY = :updatedBy');
    binds.updatedBy = updatedBy;

    const updateQuery = `
      UPDATE SEC.JOB_ROLES 
      SET ${updates.join(', ')}
      WHERE JOB_ROLE_ID = :jobRoleId
    `;

    const result = await connection.execute(updateQuery, binds, { autoCommit: true });

    await connection.close();

    if (result.rowsAffected === 0) {
      return null;
    }

    return await this.getById(jobRoleId);
  } catch (error) {
    await connection.close();
    throw error;
  }
}


  /**
   * Delete a duty role
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async delete(req, res) {
    try {
      const dutyRoleId = parseInt(req.params.id);
      
      if (isNaN(dutyRoleId)) {
        return res.status(400).json(
          DutyRoleView.formatErrorResponse('Invalid duty role ID', 400)
        );
      }

      const deleted = await DutyRoleModel.delete(dutyRoleId);

      if (!deleted) {
        return res.status(404).json(
          DutyRoleView.formatErrorResponse('Duty role not found', 404)
        );
      }

      res.json({
        success: true,
        message: 'Duty role deleted successfully'
      });
    } catch (error) {
      res.status(500).json(
        DutyRoleView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Assign one or more privileges to a duty role (additive)
   * @route POST /api/duty-roles/:id/privileges
   * @body  { privilegeIds: number[] } or { privilegeIds: string[] }
   */
  static async addPrivileges(req, res) {
    try {
      const dutyRoleId = parseInt(req.params.id, 10);
      
      if (isNaN(dutyRoleId)) {
        return res.status(400).json(
          DutyRoleView.formatErrorResponse('Invalid duty role ID', 400)
        );
      }

      // Safely destructure req.body
      const body = req.body || {};
      const { privilegeIds, updatedBy } = body;

      if (!Array.isArray(privilegeIds) || privilegeIds.length === 0) {
        return res.status(400).json(
          DutyRoleView.formatErrorResponse('privilegeIds must be a non-empty array', 400)
        );
      }

      const result = await DutyRoleModel.addPrivilegesToDutyRole(
        dutyRoleId,
        privilegeIds,
        updatedBy || 'SYSTEM'
      );

      if (!result) {
        return res.status(404).json(
          DutyRoleView.formatErrorResponse('Duty role not found', 404)
        );
      }

      return res.status(200).json(
        DutyRoleView.formatPrivilegeAssignmentResponse(result, privilegeIds)
      );
    } catch (error) {
      return res.status(500).json(
        DutyRoleView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Remove a single privilege from a duty role
   * @route DELETE /api/duty-roles/:id/privileges/:privilegeId
   */
  static async removePrivilege(req, res) {
    try {
      const dutyRoleId = parseInt(req.params.id, 10);
      const privilegeId = parseInt(req.params.privilegeId, 10);
      const updatedBy = req.body?.updatedBy || 'SYSTEM';

      if (isNaN(dutyRoleId)) {
        return res.status(400).json(
          DutyRoleView.formatErrorResponse('Invalid duty role ID', 400)
        );
      }

      if (isNaN(privilegeId)) {
        return res.status(400).json(
          DutyRoleView.formatErrorResponse('Invalid privilege ID', 400)
        );
      }

      const result = await DutyRoleModel.removePrivilegeFromDutyRole(
        dutyRoleId,
        privilegeId,
        updatedBy
      );

      if (!result) {
        return res.status(404).json(
          DutyRoleView.formatErrorResponse('Duty role not found', 404)
        );
      }

      return res.status(200).json(
        DutyRoleView.formatPrivilegeRemovalResponse(result, privilegeId)
      );
    } catch (error) {
      return res.status(500).json(
        DutyRoleView.formatErrorResponse(error.message, 500)
      );
    }
  }
}

