import Joi from 'joi';

export const ingestionSchema = Joi.object({
  server_id: Joi.number().integer().required(),
  timestamp: Joi.date().iso().required(),
  status: Joi.string().valid('UP', 'DOWN', 'DEGRADED').required(),
  latency_ms: Joi.number().min(0).required(),
  cpu_percent: Joi.number().min(0).max(100).required(),
  mem_percent: Joi.number().min(0).max(100).required(),
  disk_percent: Joi.number().min(0).max(100).required(),
  message: Joi.string().allow('').optional()
});
