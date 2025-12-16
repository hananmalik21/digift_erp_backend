import { toLowerCaseKeys, generatePageNumbers } from '../../utils/stringUtils.js';

/**
 * User View - Response formatting for users API
 */
export class UserView {
  /**
   * Format paginated response
   * @param {Object} result - Result object from model
   * @returns {Object} - Formatted response
   */
  static formatPaginatedResponse(result) {
    // Map decoded job roles to job_roles field and clean encoded arrays
    const formattedData = result.data.map(item => {
      // Extract job roles decoded before converting
      const jobRolesDecoded = item.JOB_ROLES_DECODED || null;
      
      const lowerCaseItem = toLowerCaseKeys(item);
      
      // Remove encoded job roles
      delete lowerCaseItem.job_roles;
      delete lowerCaseItem.job_roles_decoded;
      
      // Process job roles to remove encoded arrays and inherited fields
      if (jobRolesDecoded && Array.isArray(jobRolesDecoded)) {
        lowerCaseItem.job_roles = jobRolesDecoded.map(jr => {
          // Extract only duty_roles decoded (remove inherited_from and inherited)
          const dutyRolesDecoded = jr.DUTY_ROLES_DECODED || jr.duty_roles_decoded || null;
          
          // Remove ALL encoded fields and inherited fields (both uppercase and lowercase variations)
          const cleanedJr = { ...jr };
          delete cleanedJr.DUTY_ROLES;
          delete cleanedJr.INHERITED_FROM;
          delete cleanedJr.INHERITED;
          delete cleanedJr.DUTY_ROLES_DECODED;
          delete cleanedJr.INHERITED_FROM_DECODED;
          delete cleanedJr.INHERITED_DECODED;
          delete cleanedJr.duty_roles;
          delete cleanedJr.inherited_from;
          delete cleanedJr.inherited;
          delete cleanedJr.duty_roles_decoded;
          delete cleanedJr.inherited_from_decoded;
          delete cleanedJr.inherited_decoded;
          
          const lowerCaseJr = toLowerCaseKeys(cleanedJr);
          
          // Add only duty_roles decoded (remove inherited_from and inherited)
          if (dutyRolesDecoded && Array.isArray(dutyRolesDecoded)) {
            lowerCaseJr.duty_roles = toLowerCaseKeys(dutyRolesDecoded);
          } else {
            lowerCaseJr.duty_roles = [];
          }
          
          // Explicitly remove inherited_from and inherited if they exist
          delete lowerCaseJr.inherited_from;
          delete lowerCaseJr.inherited;
          
          return lowerCaseJr;
        });
      } else {
        lowerCaseItem.job_roles = [];
      }
      
      return lowerCaseItem;
    });

    return {
      success: true,
      data: formattedData,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        hasNextPage: result.page < result.totalPages,
        hasPrevPage: result.page > 1,
        pages: generatePageNumbers(result.page, result.totalPages)
      },
      activity: result.activity || {
        total_active_value: 0,
        total_inactive_value: 0
      }
    };
  }

  /**
   * Format single user response
   * @param {Object} userData - User object
   * @returns {Object} - Formatted response
   */
  static formatSingleResponse(userData) {
    if (!userData) {
      return {
        success: false,
        message: 'User not found'
      };
    }
    
    // Extract job roles decoded before converting
    const jobRolesDecoded = userData.JOB_ROLES_DECODED || null;
    
    // Remove encoded job roles from original data
    const cleanedData = { ...userData };
    delete cleanedData.JOB_ROLES;
    delete cleanedData.JOB_ROLES_DECODED;
    
    const lowerCaseData = toLowerCaseKeys(cleanedData);
    
    // Process job roles to remove encoded arrays
    if (jobRolesDecoded && Array.isArray(jobRolesDecoded)) {
      lowerCaseData.job_roles = jobRolesDecoded.map(jr => {
        // Extract only duty_roles decoded (inherited_from and inherited are not needed)
        const dutyRolesDecoded = jr.DUTY_ROLES_DECODED || jr.duty_roles_decoded || null;
        
        // Remove ALL encoded fields and inherited fields (both uppercase and lowercase variations)
        const cleanedJr = { ...jr };
        delete cleanedJr.DUTY_ROLES;
        delete cleanedJr.INHERITED_FROM;
        delete cleanedJr.INHERITED;
        delete cleanedJr.DUTY_ROLES_DECODED;
        delete cleanedJr.INHERITED_FROM_DECODED;
        delete cleanedJr.INHERITED_DECODED;
        delete cleanedJr.duty_roles;
        delete cleanedJr.inherited_from;
        delete cleanedJr.inherited;
        delete cleanedJr.duty_roles_decoded;
        delete cleanedJr.inherited_from_decoded;
        delete cleanedJr.inherited_decoded;
        
        const lowerCaseJr = toLowerCaseKeys(cleanedJr);
        
        // Add decoded versions (only if they exist and are not already arrays)
        if (dutyRolesDecoded && Array.isArray(dutyRolesDecoded)) {
          lowerCaseJr.duty_roles = toLowerCaseKeys(dutyRolesDecoded);
        } else {
          lowerCaseJr.duty_roles = [];
        }
        
        // Explicitly remove inherited_from and inherited if they exist
        delete lowerCaseJr.inherited_from;
        delete lowerCaseJr.inherited;
        
        return lowerCaseJr;
      });
    } else {
      lowerCaseData.job_roles = [];
    }
    
    return {
      success: true,
      data: lowerCaseData
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

