import { MarkSpec } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import {
  EditorConfig,
  EditorPlugin,
  PluginsOptions,
  PMPluginCreateConfig,
} from '../types';
import { sortByOrder } from './sort-by-order';

export function sortByRank(a: { rank: number }, b: { rank: number }): number {
  return a.rank - b.rank;
}

export function fixExcludes(marks: {
  [key: string]: MarkSpec;
}): { [key: string]: MarkSpec } {
  const markKeys = Object.keys(marks);
  const markGroups = new Set(markKeys.map(mark => marks[mark].group));

  markKeys.forEach(markKey => {
    const mark = marks[markKey];
    if (mark.excludes) {
      mark.excludes = mark.excludes
        .split(' ')
        .filter(group => markGroups.has(group))
        .join(' ');
    }
  });
  return marks;
}

export function processPluginsList(plugins: EditorPlugin[]): EditorConfig {
  /**
   * First pass to collect pluginsOptions
   */
  const pluginsOptions = plugins.reduce<PluginsOptions>((acc, plugin) => {
    if (plugin.pluginsOptions) {
      Object.keys(plugin.pluginsOptions).forEach(pluginName => {
        if (!acc[pluginName]) {
          acc[pluginName] = [];
        }
        acc[pluginName].push(plugin.pluginsOptions![pluginName]);
      });
    }

    return acc;
  }, {});

  /**
   * Process plugins
   */
  return plugins.reduce<EditorConfig>(
    (acc, plugin) => {
      if (plugin.pmPlugins) {
        acc.pmPlugins.push(
          ...plugin.pmPlugins(
            plugin.name ? pluginsOptions[plugin.name] : undefined,
          ),
        );
      }

      if (plugin.nodes) {
        acc.nodes.push(...plugin.nodes());
      }

      if (plugin.marks) {
        acc.marks.push(...plugin.marks());
      }

      // if (plugin.contentComponent) {
      //   acc.contentComponents.push(plugin.contentComponent);
      // }

      if (plugin.primaryToolbarComponent) {
        acc.primaryToolbarComponents.push(plugin.primaryToolbarComponent);
      }

      // if (plugin.secondaryToolbarComponent) {
      //   acc.secondaryToolbarComponents.push(plugin.secondaryToolbarComponent);
      // }

      return acc;
    },
    {
      nodes: [],
      marks: [],
      pmPlugins: [],
      primaryToolbarComponents: [],
    },
  );
}

export function createPMPlugins(config: PMPluginCreateConfig): Plugin[] {
  const { editorConfig, ...rest } = config;
  return editorConfig.pmPlugins
    .sort(sortByOrder('plugins'))
    .map(({ plugin }) => plugin(rest))
    .filter((plugin): plugin is Plugin => typeof plugin !== 'undefined')
}