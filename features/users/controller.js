import { UserModel } from './model.js';
import { UserView } from './view.js';

/**
 * User Controller - HTTP request handlers for users API
 */
export class UserController {
  /**
   * Get all users with pagination and search
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getAll(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      
      if (page < 1) {
        return res.status(400).json(
          UserView.formatErrorResponse('page must be >= 1', 400)
        );
      }
      
      if (limit < 1 || limit > 1000) {
        return res.status(400).json(
          UserView.formatErrorResponse('limit must be between 1 and 1000', 400)
        );
      }
      
      const searchParams = {
        userId: req.query.userId,
        username: req.query.username,
        emailAddress: req.query.emailAddress,
        accountStatus: req.query.accountStatus,
        accountType: req.query.accountType,
        search: req.query.search
      };
      
      const result = await UserModel.getAll(page, limit, searchParams);
      res.json(UserView.formatPaginatedResponse(result));
    } catch (error) {
      res.status(500).json(
        UserView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Get user by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getById(req, res) {
    try {
      const userId = parseInt(req.params.id);
      
      if (isNaN(userId)) {
        return res.status(400).json(
          UserView.formatErrorResponse('Invalid user ID', 400)
        );
      }
      
      const userData = await UserModel.getById(userId);
      
      if (!userData) {
        return res.status(404).json(
          UserView.formatErrorResponse('User not found', 404)
        );
      }
      
      res.json(UserView.formatSingleResponse(userData));
    } catch (error) {
      res.status(500).json(
        UserView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Create a new user account (inserts into 3 tables in a transaction)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async createAccount(req, res) {
    try {
      const {
        username,
        emailAddress,
        password,
        accountType,
        accountStatus,
        startDate,
        endDate,
        mustChangePwdFlag,
        pwdNeverExpiresFlag,
        mfaEnabledFlag,
        preferredLanguage,
        timezoneCode,
        dateFormat,
        createdBy,
        lastName,
        displayName,
        firstName,
        middleName,
        employeeNumber,
        jobRoles,
        departmentName,
        jobTitle,
        phoneNumber,
        managerEmail,
        descriptionNotes
      } = req.body;

      // Validate required fields
      if (!username) {
        return res.status(400).json(
          UserView.formatErrorResponse('username is required', 400)
        );
      }

      if (!emailAddress) {
        return res.status(400).json(
          UserView.formatErrorResponse('emailAddress is required', 400)
        );
      }

      if (!password) {
        return res.status(400).json(
          UserView.formatErrorResponse('password is required', 400)
        );
      }

      // Validate accountStatus if provided
      if (accountStatus && !['ACTIVE', 'INACTIVE'].includes(accountStatus.toUpperCase())) {
        return res.status(400).json(
          UserView.formatErrorResponse('accountStatus must be ACTIVE or INACTIVE', 400)
        );
      }

      // Create account
      const userData = await UserModel.createAccount({
        username,
        emailAddress,
        password,
        accountType,
        accountStatus: accountStatus || 'ACTIVE',
        startDate,
        endDate,
        mustChangePwdFlag,
        pwdNeverExpiresFlag,
        mfaEnabledFlag,
        preferredLanguage,
        timezoneCode,
        dateFormat,
        createdBy: createdBy || 'SYSTEM',
        lastName,
        displayName,
        firstName,
        middleName,
        employeeNumber,
        departmentName,
        jobTitle,
        phoneNumber,
        managerEmail,
        descriptionNotes
      });

      res.status(201).json(UserView.formatSingleResponse(userData));
    } catch (error) {
      // Handle unique constraint violations (duplicate username or email)
      if (error.message.includes('unique constraint') || error.errorNum === 1) {
        let errorMessage = 'Username or email already exists';
        if (error.message.includes('USERNAME')) {
          errorMessage = 'Username already exists';
        } else if (error.message.includes('EMAIL')) {
          errorMessage = 'Email address already exists';
        }
        return res.status(409).json(
          UserView.formatErrorResponse(errorMessage, 409)
        );
      }

      res.status(500).json(
        UserView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Update a user account (updates 3 tables in a transaction)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async updateAccount(req, res) {
    try {
      const userId = parseInt(req.params.id);
      
      if (isNaN(userId)) {
        return res.status(400).json(
          UserView.formatErrorResponse('Invalid user ID', 400)
        );
      }

      const {
        username,
        emailAddress,
        password,
        accountType,
        accountStatus,
        startDate,
        endDate,
        mustChangePwdFlag,
        pwdNeverExpiresFlag,
        mfaEnabledFlag,
        preferredLanguage,
        timezoneCode,
        dateFormat,
        updatedBy,
        lastName,
        displayName,
        firstName,
        middleName,
        employeeNumber, // Ignored - cannot be changed
        jobRoles,
        departmentName,
        jobTitle,
        phoneNumber,
        managerEmail,
        descriptionNotes
      } = req.body;

      // Validate accountStatus if provided
      if (accountStatus && !['ACTIVE', 'INACTIVE'].includes(accountStatus.toUpperCase())) {
        return res.status(400).json(
          UserView.formatErrorResponse('accountStatus must be ACTIVE or INACTIVE', 400)
        );
      }

      // Update account
      const userData = await UserModel.updateAccount(userId, {
        username,
        emailAddress,
        password,
        accountType,
        accountStatus,
        startDate,
        endDate,
        mustChangePwdFlag,
        pwdNeverExpiresFlag,
        mfaEnabledFlag,
        preferredLanguage,
        timezoneCode,
        dateFormat,
        updatedBy: updatedBy || 'SYSTEM',
        lastName,
        displayName,
        firstName,
        middleName,
        employeeNumber, // Will be ignored in model
        jobRoles,
        departmentName,
        jobTitle,
        phoneNumber,
        managerEmail,
        descriptionNotes
      });

      if (!userData) {
        return res.status(404).json(
          UserView.formatErrorResponse('User not found', 404)
        );
      }

      res.json(UserView.formatSingleResponse(userData));
    } catch (error) {
      // Handle unique constraint violations (duplicate username or email)
      if (error.message.includes('already exists') || error.errorNum === 1) {
        return res.status(409).json(
          UserView.formatErrorResponse(error.message, 409)
        );
      }

      res.status(500).json(
        UserView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Delete a user account
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async deleteAccount(req, res) {
    try {
      const userId = parseInt(req.params.id);
      
      if (isNaN(userId)) {
        return res.status(400).json(
          UserView.formatErrorResponse('Invalid user ID', 400)
        );
      }

      const deleted = await UserModel.deleteAccount(userId);

      if (!deleted) {
        return res.status(404).json(
          UserView.formatErrorResponse('User not found', 404)
        );
      }

      res.json({
        success: true,
        message: 'User account deleted successfully'
      });
    } catch (error) {
      // Handle foreign key constraint violations
      if (error.message.includes('foreign key') || error.message.includes('integrity constraint')) {
        return res.status(409).json(
          UserView.formatErrorResponse('Cannot delete user - user is referenced by other records', 409)
        );
      }

      res.status(500).json(
        UserView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Reset user password
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async resetPassword(req, res) {
    try {
      const userId = parseInt(req.params.id);
      
      if (isNaN(userId)) {
        return res.status(400).json(
          UserView.formatErrorResponse('Invalid user ID', 400)
        );
      }

      const { password, updatedBy } = req.body;

      // Validate password
      if (!password) {
        return res.status(400).json(
          UserView.formatErrorResponse('password is required', 400)
        );
      }

      if (typeof password !== 'string' || password.trim().length === 0) {
        return res.status(400).json(
          UserView.formatErrorResponse('password cannot be empty', 400)
        );
      }

      // Reset password
      const userData = await UserModel.resetPassword(
        userId,
        password,
        updatedBy || 'SYSTEM'
      );

      if (!userData) {
        return res.status(404).json(
          UserView.formatErrorResponse('User not found', 404)
        );
      }

      res.json({
        success: true,
        message: 'Password reset successfully',
        data: UserView.formatSingleResponse(userData).data
      });
    } catch (error) {
      res.status(500).json(
        UserView.formatErrorResponse(error.message, 500)
      );
    }
  }
}

