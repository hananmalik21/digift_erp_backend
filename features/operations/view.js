import { toLowerCaseKeys, generatePageNumbers } from '../../utils/stringUtils.js';

/**
 * Operation View - Response formatting for operations API
 */
export class OperationView {
  /**
   * Format paginated response
   * @param {Object} result - Result object from model
   * @returns {Object} - Formatted response
   */
  static formatPaginatedResponse(result) {
    // Count active operations in current page data
    const activeOperations = result.data.filter(item => 
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
        activeOperations: activeOperations
      },
      activity: result.activity || {
        total_active_value: 0,
        total_inactive_value: 0
      }
    };
  }

  /**
   * Format single operation response
   * @param {Object} operationData - Operation object
   * @returns {Object} - Formatted response
   */
  static formatSingleResponse(operationData) {
    if (!operationData) {
      return {
        success: false,
        message: 'Operation not found'
      };
    }
    
    return {
      success: true,
      data: toLowerCaseKeys(operationData)
    };
  }

  /**
   * Format dropdown response (array of operations)
   * @param {Array} operations - Array of operation objects
   * @returns {Array} - Formatted array with lowercase keys
   */
  static formatDropdownResponse(operations) {
    return toLowerCaseKeys(operations);
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

