import type { GenerationRequest } from '../../../types'

import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../../types'
import { createOpenAICompatibleValidators } from '../../../validators'
import { defineProvider } from '../../registry'

const configSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://dashscope.aliyuncs.com/compatible-mode/v1'),
})

type Config = z.input<typeof configSchema>

/**
 * Alibaba Cloud Bailian through its OpenAI-compatible endpoint.
 *
 * The console lists chat, vision, and omni models under one API key. The
 * compatible endpoint serves all of them, so one definition covers every
 * chat and vision model the account owns.
 */
export const providerAlibabaCloudBailian = defineProvider<Config, 'alibaba-cloud-bailian'>({
  id: 'alibaba-cloud-bailian',
  order: 5,
  name: 'Alibaba Cloud Bailian',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.alibaba-cloud-bailian.title'),
  description: 'bailian.console.aliyun.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.alibaba-cloud-bailian.description'),
  tasks: ['chat', 'text-to-speech'],
  capabilities: {
    chat: {
      generation: {
        supportedProtocols: ['chat-completions'],
        defaultProtocol: 'chat-completions',
      },
    },
  },
  icon: 'i-lobe-icons:alibabacloud',

  createProviderConfig: ({ t }) => configSchema.extend({
    apiKey: configSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: configSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    const provider = createOpenAI(config.apiKey.trim(), config.baseUrl?.trim())

    return {
      model: provider.model,
      generation(model: string): GenerationRequest {
        return { protocol: 'chat-completions', config: provider.chat(model) }
      },
    }
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ModelList, ProviderValidationCheck.ChatCompletions],
    }),
  },
})
