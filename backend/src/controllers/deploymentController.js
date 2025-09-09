/**
 * Deployment Controller
 * Handles chatbot deployment management and embed code generation
 */

const { ScriptTag } = require('../models');
const { asyncHandler, createServiceError } = require('../utils/errorHelpers');
const mongoose = require('mongoose');
const { FRONTEND_URL } = require('../config/env');

// ==================== CREATE DEPLOYMENT ====================

const createDeployment = asyncHandler(async (req, res) => {
  const { agentId } = req.params;
  const {
    name,
    description,
    websiteUrl,
    settings = {}
  } = req.body;

  console.log('🚀 Creating deployment for agent:', agentId);

  // Validate required fields
  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Deployment name is required',
        code: 'MISSING_NAME'
      }
    });
  }

  // Default settings
  const defaultSettings = {
    theme: 'light',
    position: 'bottom-right',
    size: {
      width: '400px',
      height: '600px'
    },
    customCSS: '',
    customJS: '',
    autoOpen: false,
    welcomeMessage: 'Hi! How can I help you today?'
  };

  const finalSettings = { ...defaultSettings, ...settings };

  try {
    // Generate embed code first (we'll use a temporary ID for now)
    const tempId = new mongoose.Types.ObjectId();
    const embedCode = generateEmbedCode(tempId, finalSettings);
    
    // Create deployment record with all required fields
    const deployment = new ScriptTag({
      // Multi-tenant fields (required for new records)
      companyId: req.user?.companyId,
      createdBy: req.user?.userId,
      
      agent: agentId,
      name: name.trim(),
      description: description?.trim() || '',
      version: '1.0.0',
      isActive: true,
      deploymentUrl: websiteUrl,
      settings: finalSettings,
      scriptCode: embedCode,
      embedCode: embedCode,
      analytics: {
        views: 0,
        interactions: 0,
        lastViewed: null
      }
    });

    await deployment.save();

    // Update embed code with the actual _id
    const finalEmbedCode = generateEmbedCode(deployment._id, finalSettings);
    deployment.embedCode = finalEmbedCode;
    deployment.scriptCode = finalEmbedCode;
    await deployment.save();

    console.log('✅ Deployment created successfully:', deployment._id);

    res.status(201).json({
      success: true,
      data: {
        _id: deployment._id,
        agentId: agentId,
        name: deployment.name,
        description: deployment.description,
        websiteUrl: deployment.deploymentUrl,
        settings: deployment.settings,
        embedCode: deployment.embedCode,
        isActive: deployment.isActive,
        analytics: deployment.analytics,
        createdAt: deployment.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Failed to create deployment:', error);
    throw createServiceError(`Failed to create deployment: ${error.message}`, 'DEPLOYMENT_CREATION_FAILED');
  }
});

// ==================== GET DEPLOYMENTS ====================

const getDeployments = asyncHandler(async (req, res) => {
  const { agentId } = req.params;

  console.log('📋 Fetching deployments for agent:', agentId);

  try {
    const deployments = await ScriptTag.find({ agent: agentId })
      .sort({ createdAt: -1 })
      .select('-scriptCode'); // Exclude large script code from list

    console.log(`✅ Found ${deployments.length} deployments`);

    res.json({
      success: true,
      data: deployments.map(deployment => ({
        _id: deployment._id,
        agentId: deployment.agent,
        name: deployment.name,
        description: deployment.description,
        websiteUrl: deployment.deploymentUrl,
        settings: deployment.settings,
        isActive: deployment.isActive,
        analytics: deployment.analytics,
        createdAt: deployment.createdAt,
        updatedAt: deployment.updatedAt
      }))
    });

  } catch (error) {
    console.error('❌ Failed to fetch deployments:', error);
    throw createServiceError(`Failed to fetch deployments: ${error.message}`, 'DEPLOYMENT_FETCH_FAILED');
  }
});

// ==================== GET SINGLE DEPLOYMENT ====================

const getDeployment = asyncHandler(async (req, res) => {
  const { agentId, _id } = req.params;

  console.log('🔍 Fetching deployment:', _id, 'for agent:', agentId);

  try {
    const deployment = await ScriptTag.findOne({
      _id: _id,
      agent: agentId
    });

    if (!deployment) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Deployment not found',
          code: 'DEPLOYMENT_NOT_FOUND'
        }
      });
    }

    console.log('✅ Deployment found:', deployment.name);

    res.json({
      success: true,
      data: {
        _id: deployment._id,
        agentId: deployment.agent,
        name: deployment.name,
        description: deployment.description,
        websiteUrl: deployment.deploymentUrl,
        settings: deployment.settings,
        embedCode: deployment.embedCode,
        isActive: deployment.isActive,
        analytics: deployment.analytics,
        createdAt: deployment.createdAt,
        updatedAt: deployment.updatedAt
      }
    });

  } catch (error) {
    console.error('❌ Failed to fetch deployment:', error);
    throw createServiceError(`Failed to fetch deployment: ${error.message}`, 'DEPLOYMENT_FETCH_FAILED');
  }
});

// ==================== UPDATE DEPLOYMENT ====================

const updateDeployment = asyncHandler(async (req, res) => {
  const { agentId, _id } = req.params;
  const updateData = req.body;

  console.log('🔄 Updating deployment:', _id);

  try {
    const deployment = await ScriptTag.findOne({
      _id: _id,
      agent: agentId
    });

    if (!deployment) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Deployment not found',
          code: 'DEPLOYMENT_NOT_FOUND'
        }
      });
    }

    // Update fields
    if (updateData.name) deployment.name = updateData.name.trim();
    if (updateData.description !== undefined) deployment.description = updateData.description.trim();
    if (updateData.websiteUrl !== undefined) deployment.deploymentUrl = updateData.websiteUrl;
    if (updateData.settings) {
      deployment.settings = { ...deployment.settings, ...updateData.settings };
    }
    if (updateData.isActive !== undefined) deployment.isActive = updateData.isActive;

    // Regenerate embed code if settings changed
    if (updateData.settings) {
      deployment.embedCode = generateEmbedCode(deployment._id, deployment.settings);
      deployment.scriptCode = deployment.embedCode;
    }

    await deployment.save();

    console.log('✅ Deployment updated successfully');

    res.json({
      success: true,
      data: {
        _id: deployment._id,
        agentId: deployment.agent,
        name: deployment.name,
        description: deployment.description,
        websiteUrl: deployment.deploymentUrl,
        settings: deployment.settings,
        embedCode: deployment.embedCode,
        isActive: deployment.isActive,
        analytics: deployment.analytics,
        createdAt: deployment.createdAt,
        updatedAt: deployment.updatedAt
      }
    });

  } catch (error) {
    console.error('❌ Failed to update deployment:', error);
    throw createServiceError(`Failed to update deployment: ${error.message}`, 'DEPLOYMENT_UPDATE_FAILED');
  }
});

// ==================== DELETE DEPLOYMENT ====================

const deleteDeployment = asyncHandler(async (req, res) => {
  const { agentId, _id } = req.params;

  console.log('🗑️ Deleting deployment:', _id);

  try {
    const deployment = await ScriptTag.findOneAndDelete({
      _id: _id,
      agent: agentId
    });

    if (!deployment) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Deployment not found',
          code: 'DEPLOYMENT_NOT_FOUND'
        }
      });
    }

    console.log('✅ Deployment deleted successfully');

    res.json({
      success: true,
      message: 'Deployment deleted successfully'
    });

  } catch (error) {
    console.error('❌ Failed to delete deployment:', error);
    throw createServiceError(`Failed to delete deployment: ${error.message}`, 'DEPLOYMENT_DELETE_FAILED');
  }
});

// ==================== GET EMBED CODE ====================

const getEmbedCode = asyncHandler(async (req, res) => {
  const { _id } = req.params;

  console.log('📋 Getting embed code for deployment:', _id);

  try {
    const deployment = await ScriptTag.findOne({ _id: _id });

    if (!deployment) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Deployment not found',
          code: 'DEPLOYMENT_NOT_FOUND'
        }
      });
    }

    if (!deployment.isActive) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Deployment is not active',
          code: 'DEPLOYMENT_INACTIVE'
        }
      });
    }

    console.log('✅ Embed code retrieved successfully');

    res.json({
      success: true,
      data: {
        _id: deployment._id,
        agentId: deployment.agent,
        embedCode: deployment.embedCode,
        settings: deployment.settings
      }
    });

  } catch (error) {
    console.error('❌ Failed to get embed code:', error);
    throw createServiceError(`Failed to get embed code: ${error.message}`, 'EMBED_CODE_FETCH_FAILED');
  }
});

// ==================== TRACK DEPLOYMENT ANALYTICS ====================

const trackAnalytics = asyncHandler(async (req, res) => {
  const { _id } = req.params;
  const { event, data = {} } = req.body;

  console.log('📊 Tracking analytics for deployment:', _id, 'event:', event);

  try {
    const deployment = await ScriptTag.findOne({ _id: _id });

    if (!deployment) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Deployment not found',
          code: 'DEPLOYMENT_NOT_FOUND'
        }
      });
    }

    // Update analytics based on event
    switch (event) {
      case 'view':
        deployment.analytics.views += 1;
        deployment.analytics.lastViewed = new Date();
        break;
      case 'interaction':
        deployment.analytics.interactions += 1;
        break;
      default:
        console.log('Unknown analytics event:', event);
    }

    await deployment.save();

    console.log('✅ Analytics tracked successfully');

    res.json({
      success: true,
      message: 'Analytics tracked successfully'
    });

  } catch (error) {
    console.error('❌ Failed to track analytics:', error);
    throw createServiceError(`Failed to track analytics: ${error.message}`, 'ANALYTICS_TRACKING_FAILED');
  }
});

// ==================== HELPER FUNCTIONS ====================

/**
 * Generate embed code for deployment
 */
function generateEmbedCode(_id, settings) {
  const baseUrl = FRONTEND_URL;
  const widgetUrl = `${baseUrl}/widget/chat-widget.js`;
  
  const embedCode = `
<!-- AI Chatbot Widget - Generated by AI Chatbot Generator -->
<script>
  (function() {
    var chatbotConfig = {
      _id: '${_id}',
      theme: '${settings.theme}',
      position: '${settings.position}',
      size: {
        width: '${settings.size.width}',
        height: '${settings.size.height}'
      },
      autoOpen: ${settings.autoOpen},
      welcomeMessage: '${settings.welcomeMessage}',
      customCSS: \`${settings.customCSS || ''}\`,
      customJS: \`${settings.customJS || ''}\`
    };
    
    var script = document.createElement('script');
    script.src = '${widgetUrl}';
    script.async = true;
    script.onload = function() {
      if (window.AIChatbotWidget) {
        window.AIChatbotWidget.init(chatbotConfig);
      }
    };
    document.head.appendChild(script);
  })();
</script>
<!-- End AI Chatbot Widget -->`;

  return embedCode.trim();
}

module.exports = {
  createDeployment,
  getDeployments,
  getDeployment,
  updateDeployment,
  deleteDeployment,
  getEmbedCode,
  trackAnalytics
};
