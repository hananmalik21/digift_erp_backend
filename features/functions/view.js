import { toLowerCaseKeys, generatePageNumbers } from '../../utils/stringUtils.js';

/**
 * Function View - Response formatting for functions API
 */
export class FunctionView {
  /**
   * Format paginated response
   * @param {Object} result - Result object from model
   * @returns {Object} - Formatted response
   */
  static formatPaginatedResponse(result) {
    // Count active functions in current page data
    const activeFunctions = result.data.filter(item => 
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
        activeFunctions: activeFunctions
      },
      activity: result.activity || {
        total_active_value: 0,
        total_inactive_value: 0
      }
    };
  }

  /**
   * Format single function response
   * @param {Object} functionData - Function object
   * @returns {Object} - Formatted response
   */
  static formatSingleResponse(functionData) {
    if (!functionData) {
      return {
        success: false,
        message: 'Function not found'
      };
    }
    
    return {
      success: true,
      data: toLowerCaseKeys(functionData)
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

