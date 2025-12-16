import { toLowerCaseKeys, generatePageNumbers } from '../../utils/stringUtils.js';

/**
 * Job Role View - Response formatting for job roles API
 */
export class JobRoleView {
  /**
   * Format paginated response
   */
  static formatPaginatedResponse(result) {
    const activeJobRoles = result.data.filter(item => 
      item.STATUS === 'ACTIVE' || item.status === 'ACTIVE'
    ).length;
    
    const transformedData = result.data.map(item => {
      // Extract decoded arrays BEFORE toLowerCaseKeys to avoid double conversion
      const dutyRolesDecoded = item.DUTY_ROLES_DECODED || null;
      const inheritedFromDecoded = item.INHERITED_FROM_DECODED || null;
      const inheritedDecoded = item.INHERITED_DECODED || null;

      // Remove encoded fields from original item before converting
      const cleanedItem = { ...item };
      delete cleanedItem.DUTY_ROLES;
      delete cleanedItem.INHERITED_FROM;
      delete cleanedItem.INHERITED;
      delete cleanedItem.DUTY_ROLES_DECODED;
      delete cleanedItem.INHERITED_FROM_DECODED;
      delete cleanedItem.INHERITED_DECODED;

      const lowerCaseItem = toLowerCaseKeys(cleanedItem);

      // Add decoded versions
      lowerCaseItem.duty_roles = dutyRolesDecoded ? toLowerCaseKeys(dutyRolesDecoded) : [];
      lowerCaseItem.inherited_from = inheritedFromDecoded ? toLowerCaseKeys(inheritedFromDecoded) : [];
      lowerCaseItem.inherited = inheritedDecoded ? toLowerCaseKeys(inheritedDecoded) : [];

      return lowerCaseItem;
    });
    
    return {
      success: true,
      data: transformedData,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        hasNextPage: result.page < result.totalPages,
        hasPrevPage: result.page > 1,
        pages: generatePageNumbers(result.page, result.totalPages),
        activeJobRoles: activeJobRoles
      },
      activity: result.activity || {
        total_active_value: 0,
        total_inactive_value: 0
      }
    };
  }

  /**
   * Format single job role response
   */
  static formatSingleResponse(jobRoleData) {
    if (!jobRoleData) {
      return {
        success: false,
        message: 'Job role not found'
      };
    }
    
    // Extract decoded arrays BEFORE toLowerCaseKeys to avoid double conversion
    const dutyRolesDecoded = jobRoleData.DUTY_ROLES_DECODED || null;
    const inheritedFromDecoded = jobRoleData.INHERITED_FROM_DECODED || null;
    const inheritedDecoded = jobRoleData.INHERITED_DECODED || null;

    // Remove encoded fields from original data before converting
    const cleanedData = { ...jobRoleData };
    delete cleanedData.DUTY_ROLES;
    delete cleanedData.INHERITED_FROM;
    delete cleanedData.INHERITED;
    delete cleanedData.DUTY_ROLES_DECODED;
    delete cleanedData.INHERITED_FROM_DECODED;
    delete cleanedData.INHERITED_DECODED;

    const lowerCaseItem = toLowerCaseKeys(cleanedData);

    // Add decoded versions
    lowerCaseItem.duty_roles = dutyRolesDecoded ? toLowerCaseKeys(dutyRolesDecoded) : [];
    lowerCaseItem.inherited_from = inheritedFromDecoded ? toLowerCaseKeys(inheritedFromDecoded) : [];
    lowerCaseItem.inherited = inheritedDecoded ? toLowerCaseKeys(inheritedDecoded) : [];
    
    return {
      success: true,
      data: lowerCaseItem
    };
  }

  /**
   * Format dropdown response
   */
  static formatDropdownResponse(jobRoles) {
    return toLowerCaseKeys(jobRoles);
  }

  /**
   * Format duty role assignment response (message only)
   */
  static formatDutyRoleAssignmentResponse(result, requestedDutyRoleIds) {
    if (!result || !result.jobRoleData) {
      return {
        success: false,
        message: 'Job role not found'
      };
    }
    
    const { alreadyAssignedIds, newlyAssignedIds } = result;
    
    let message = '';
    
    if (alreadyAssignedIds.length > 0 && newlyAssignedIds.length === 0) {
      if (alreadyAssignedIds.length === 1) {
        message = `Duty role (ID: ${alreadyAssignedIds[0]}) is already assigned to this job role`;
      } else {
        message = `All duty roles (IDs: ${alreadyAssignedIds.join(', ')}) are already assigned to this job role`;
      }
    } else if (alreadyAssignedIds.length > 0 && newlyAssignedIds.length > 0) {
      const alreadyMsg = alreadyAssignedIds.length === 1
        ? `Duty role (ID: ${alreadyAssignedIds[0]}) was already assigned`
        : `Duty roles (IDs: ${alreadyAssignedIds.join(', ')}) were already assigned`;
      
      const newlyMsg = newlyAssignedIds.length === 1
        ? `Duty role (ID: ${newlyAssignedIds[0]}) has been assigned`
        : `Duty roles (IDs: ${newlyAssignedIds.join(', ')}) have been assigned`;
      
      message = `${alreadyMsg}. ${newlyMsg} to this job role`;
    } else {
      const dutyRoleCount = newlyAssignedIds.length;
      message = dutyRoleCount === 1
        ? `Duty role (ID: ${newlyAssignedIds[0]}) has been assigned to this job role`
        : `${dutyRoleCount} duty roles (IDs: ${newlyAssignedIds.join(', ')}) have been assigned to this job role`;
    }
    
    return {
      success: true,
      message: message
    };
  }

  /**
   * Format duty role removal response
   */
  static formatDutyRoleRemovalResponse(result, dutyRoleId) {
    if (!result || !result.jobRoleData) {
      return {
        success: false,
        message: 'Job role not found'
      };
    }
    
    const { wasRemoved } = result;
    
    const message = wasRemoved
      ? `Duty role (ID: ${dutyRoleId}) has been removed from this job role`
      : `Duty role (ID: ${dutyRoleId}) is already removed from this job role`;
    
    return {
      success: true,
      message: message
    };
  }

  /**
   * Format error response
   */
  static formatErrorResponse(message, statusCode = 500) {
    return {
      success: false,
      error: message,
      statusCode
    };
  }
}
