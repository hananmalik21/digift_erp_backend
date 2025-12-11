import { toLowerCaseKeys, generatePageNumbers } from '../../utils/stringUtils.js';

/**
 * Duty Role View - Response formatting for duty roles API
 */
export class DutyRoleView {
  /**
   * Format paginated response
   * @param {Object} result - Result object from model
   * @returns {Object} - Formatted response
   */
  static formatPaginatedResponse(result) {
    // Count active duty roles in current page data
    const activeDutyRoles = result.data.filter(item => 
      item.STATUS === 'ACTIVE' || item.status === 'ACTIVE'
    ).length;
    
    // Transform data to expose decoded function_privileges
    const transformedData = result.data.map(item => {
      const lowerCaseItem = toLowerCaseKeys(item);

      // If we have decoded privileges, expose them as function_privileges
      if (lowerCaseItem.function_privileges_decoded) {
        lowerCaseItem.function_privileges = lowerCaseItem.function_privileges_decoded;
      }

      // Remove the helper property only
      delete lowerCaseItem.function_privileges_decoded;

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
        activeDutyRoles: activeDutyRoles
      },
      activity: result.activity || {
        total_active_value: 0,
        total_inactive_value: 0
      }
    };
  }

  /**
   * Format single duty role response
   * @param {Object} dutyRoleData - Duty role object
   * @returns {Object} - Formatted response
   */
  static formatSingleResponse(dutyRoleData) {
    if (!dutyRoleData) {
      return {
        success: false,
        message: 'Duty role not found'
      };
    }
    
    const lowerCaseItem = toLowerCaseKeys(dutyRoleData);

    // If we have decoded privileges, expose them as function_privileges
    if (lowerCaseItem.function_privileges_decoded) {
      lowerCaseItem.function_privileges = lowerCaseItem.function_privileges_decoded;
    }

    // Remove the helper property only
    delete lowerCaseItem.function_privileges_decoded;
    
    return {
      success: true,
      data: lowerCaseItem
    };
  }

  /**
   * Format privilege assignment response
   * @param {Object} result - Result object from model with dutyRoleData, alreadyAssignedIds, newlyAssignedIds, wasUpdated
   * @param {Array<number>} requestedPrivilegeIds - Original privilege IDs that were requested
   * @returns {Object} - Formatted response with message only
   */
  static formatPrivilegeAssignmentResponse(result, requestedPrivilegeIds) {
    if (!result || !result.dutyRoleData) {
      return {
        success: false,
        message: 'Duty role not found'
      };
    }
    
    const { alreadyAssignedIds, newlyAssignedIds } = result;
    
    let message = '';
    
    if (alreadyAssignedIds.length > 0 && newlyAssignedIds.length === 0) {
      // All privileges were already assigned
      if (alreadyAssignedIds.length === 1) {
        message = `Privilege (ID: ${alreadyAssignedIds[0]}) is already assigned to this duty role`;
      } else {
        message = `All privileges (IDs: ${alreadyAssignedIds.join(', ')}) are already assigned to this duty role`;
      }
    } else if (alreadyAssignedIds.length > 0 && newlyAssignedIds.length > 0) {
      // Some were already assigned, some were newly assigned
      const alreadyMsg = alreadyAssignedIds.length === 1
        ? `Privilege (ID: ${alreadyAssignedIds[0]}) was already assigned`
        : `Privileges (IDs: ${alreadyAssignedIds.join(', ')}) were already assigned`;
      
      const newlyMsg = newlyAssignedIds.length === 1
        ? `Privilege (ID: ${newlyAssignedIds[0]}) has been assigned`
        : `Privileges (IDs: ${newlyAssignedIds.join(', ')}) have been assigned`;
      
      message = `${alreadyMsg}. ${newlyMsg} to this duty role`;
    } else {
      // All were newly assigned
      const privilegeCount = newlyAssignedIds.length;
      message = privilegeCount === 1
        ? `Privilege (ID: ${newlyAssignedIds[0]}) has been assigned to this duty role`
        : `${privilegeCount} privileges (IDs: ${newlyAssignedIds.join(', ')}) have been assigned to this duty role`;
    }
    
    return {
      success: true,
      message: message
    };
  }

  /**
   * Format privilege removal response
   * @param {Object} result - Result object from model with dutyRoleData, wasRemoved, wasUpdated
   * @param {number} privilegeId - Privilege ID that was requested to be removed
   * @returns {Object} - Formatted response with message only
   */
  static formatPrivilegeRemovalResponse(result, privilegeId) {
    if (!result || !result.dutyRoleData) {
      return {
        success: false,
        message: 'Duty role not found'
      };
    }
    
    const { wasRemoved } = result;
    
    const message = wasRemoved
      ? `Privilege (ID: ${privilegeId}) has been removed from this duty role`
      : `Privilege (ID: ${privilegeId}) is already removed from this duty role`;
    
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
