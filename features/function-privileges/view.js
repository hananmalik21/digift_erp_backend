import { toLowerCaseKeys, generatePageNumbers } from '../../utils/stringUtils.js';

/**
 * Function Privilege View - Response formatting for function privileges API
 */
export class FunctionPrivilegeView {
  /**
   * Format paginated response
   * @param {Object} result - Result object from model
   * @returns {Object} - Formatted response
   */
  static formatPaginatedResponse(result) {
    // Count active function privileges in current page data
    const activePrivileges = result.data.filter(item => 
      item.STATUS === 'ACTIVE' || item.status === 'ACTIVE'
    ).length;
    
    return {
      success: true,
      data: toLowerCaseKeys(result.data),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        hasNextPage: result.page < result.totalPages,
        hasPrevPage: result.page > 1,
        pages: generatePageNumbers(result.page, result.totalPages),
        activePrivileges: activePrivileges
      },
      activity: result.activity || {
        total_active_value: 0,
        total_inactive_value: 0
      }
    };
  }

  /**
   * Format single function privilege response
   * @param {Object} privilegeData - Function privilege object
   * @returns {Object} - Formatted response
   */
  static formatSingleResponse(privilegeData) {
    if (!privilegeData) {
      return {
        success: false,
        message: 'Function privilege not found'
      };
    }
    
    return {
      success: true,
      data: toLowerCaseKeys(privilegeData)
    };
  }

  /**
   * Format error response
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @returns {Object} - Formatted error response
   */
  static formatErrorResponse(message, statusCode = 500) {
    return {
      success: false,
      error: message,
      statusCode
    };
  }
}

