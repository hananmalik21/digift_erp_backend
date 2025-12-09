import { toLowerCaseKeys, generatePageNumbers } from '../../utils/stringUtils.js';

/**
 * Module View - Response formatting for modules API
 */
export class ModuleView {
  /**
   * Format paginated response
   * @param {Object} result - Result object from model
   * @returns {Object} - Formatted response
   */
  static formatPaginatedResponse(result) {
    // Count active modules in current page data
    const activeModules = result.data.filter(item => 
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
        activeModules: activeModules
      },
      activity: result.activity || {
        total_active_value: 0,
        total_inactive_value: 0
      }
    };
  }

  /**
   * Format single module response
   * @param {Object} moduleData - Module object
   * @returns {Object} - Formatted response
   */
  static formatSingleResponse(moduleData) {
    if (!moduleData) {
      return {
        success: false,
        message: 'Module not found'
      };
    }
    
    return {
      success: true,
      data: toLowerCaseKeys(moduleData)
    };
  }

  /**
   * Format dropdown response (array of modules)
   * @param {Array} modules - Array of module objects
   * @returns {Array} - Formatted array with lowercase keys
   */
  static formatDropdownResponse(modules) {
    return toLowerCaseKeys(modules);
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

