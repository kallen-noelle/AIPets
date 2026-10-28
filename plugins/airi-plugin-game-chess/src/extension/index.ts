import { defineExtension } from '@proj-airi/plugin-sdk'
import { gameletKit } from '@proj-airi/plugin-sdk-tamagotchi'

/**
 * Stable module id that the chess widget uses as its binding id.
 *
 * The widgets-calling devtools preset spawns the `extension-ui` widget with this
 * id, so the mounted gamelet must publish the same id.
 */
const moduleId = 'chess-like-main'

export default defineExtension({
  id: 'airi-plugin-game-chess',
  async setup(ctx) {
    const module = await ctx.modules.register({
      id: moduleId,
      permissions: {
        apis: [{ key: 'kit.gamelet', actions: ['invoke'] }],
        resources: [{ key: 'proj-airi:plugin-sdk:resources:kits:kit.gamelet:bindings', actions: ['write'] }],
      },
    })

    const gamelets = await module.kits.use(gameletKit)

    await gamelets.mount({
      bindingId: moduleId,
      title: 'Chess',
      ui: gamelets.iframe({
        assetPath: 'ui/index.html',
        sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
      }),
      init: {
        airiSide: 'black',
        opening: 'queen-gambit',
      },
    })
  },
})
