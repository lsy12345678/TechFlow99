import Router from 'next/router';
import { v4 as uuid } from 'uuid';
import { StateCreator } from 'zustand';

import { FlowStore, flowSelectors } from '@/store/flow';
import { ChatAgent } from '@/types';

import { createFlow, createTextTaskNode } from '@/helpers/flow';
import { createWorkFlowDataBase, queryWorkFlowDataBaseList } from '@/services/workflow';
import { Workflow } from '@/types/flow';
import { message } from 'antd';
import yaml from 'js-yaml';
import { initAITaskContent } from '../initialState';
import { FlowsDispatch, flowsReducer } from '../reducers/flows';

export interface FlowCRUDSlice {
  dispatchFlow: (payload: FlowsDispatch, debug?: { type: string } & any) => void;
  createFlow: () => void;
  createFlowBaseOnAgent: (agent: ChatAgent) => void;
  removeFlow: (id: string) => void;
  importFlow: (id: string, flow: string) => void;
  openImportFlowModal: (id: string) => void;
  closeImportFlowModal: (id: string) => void;
  /**
   * 导出所有节点
   * @returns
   */
  exportWorkflow: () => void;
  queryFlowListForServer: () => Promise<void>;
  saveFlowToServer: () => void;
}

export const flowCrudSlice: StateCreator<
  FlowStore,
  [['zustand/devtools', never]],
  [],
  FlowCRUDSlice
> = (set, get) => ({
  dispatchFlow: (payload) => {
    const { type, ...res } = payload;
    set({ flows: flowsReducer(get().flows, payload) }, false, {
      type: `dispatchFlow/${type}`,
      payload: res,
    });
  },
  createFlow: () => {
    const flowId = uuid();
    const agentId = uuid();

    const aiTaskNode = createTextTaskNode({ id: agentId }, initAITaskContent, {
      title: '默认节点',
    });

    get().dispatchFlow({
      type: 'addFlow',
      flow: createFlow(
        flowId,
        { title: 'AI创新工坊' },
        {
          [aiTaskNode.id]: aiTaskNode,
        },
      ),
    });

    Router.push(`/flow/${flowId}`);
  },
  openImportFlowModal: (id: string) => {
    get().dispatchFlow({
      type: 'updateFlowState',
      id,
      state: {
        importModalOpen: true,
      },
    });
  },
  closeImportFlowModal: (id: string) => {
    get().dispatchFlow({
      type: 'updateFlowState',
      id,
      state: {
        importModalOpen: false,
      },
    });
  },
  importFlow: (id: string, flow: string) => {
    get().dispatchFlow({
      type: 'updateFlow',
      id,
      flow: yaml.load(flow) as Workflow,
    });
  },
  createFlowBaseOnAgent: (agent) => {
    const flowId = uuid();
    const meta = {
      title: agent.title + '的任务流',
      avatar: agent.avatar,
      avatarBackground: agent.avatarBackground,
      description: `基于 「${agent.title}」 创建的任务 \n ${agent.description}`,
    };

    const aiTaskNode = createTextTaskNode(
      { id: agent.id },
      { llm: { model: agent.model || 'gpt-3.5-turbo' }, systemRole: agent.content },
      {
        title: agent.title,
        avatar: agent.avatar,
        avatarBackground: agent.avatarBackground,
        description: agent.description,
      },
    );

    get().dispatchFlow({
      type: 'addFlow',
      flow: createFlow(flowId, meta, { [agent.id]: aiTaskNode }),
    });

    Router.push(`/flow/${flowId}`);
  },
  removeFlow: (id) => {
    get().dispatchFlow({ type: 'deleteFlow', id });
    Router.push('/flow');
  },

  /**
   * 转化未 yaml 文件
   */
  exportWorkflow: async () => {
    const hideLoading = message.loading('正在导出...', 0);
    try {
      const data = flowSelectors.currentFlow(get());
      const url = window.URL || window.webkitURL || window;
      const blob = new Blob([
        yaml.dump(data, {
          indent: 2,
          replacer: (key, value) => {
            if (key === 'output') {
              return undefined;
            }
            return value;
          },
        }),
      ]);
      const saveLink = document.createElementNS(
        'http://www.w3.org/1999/xhtml',
        'a',
      ) as HTMLAnchorElement;
      saveLink.href = url.createObjectURL(blob);
      // 设置 download 属性
      saveLink.download = data.id + '-workflow.yml';
      saveLink.click();
    } catch (error) {
      message.error('导出失败');
    }
    hideLoading();
  },
  // 从服务器查询所有的任务流
  queryFlowListForServer: async () => {
    queryWorkFlowDataBaseList({
      params: undefined,
    }).then((res) => {
      res.forEach((item) => {
        const id = item.id;
        if (!id || !item.workflow) return;
        const flow = yaml.load(item.workflow) as Workflow;
        if (get().flows[id]) {
          get().dispatchFlow({
            type: 'updateFlow',
            id,
            flow: flow as Workflow,
          });
          return;
        }
        get().dispatchFlow({
          type: 'addFlow',
          flow: createFlow(id, flow.meta, {}),
        });
        get().dispatchFlow({
          type: 'updateFlow',
          id,
          flow: flow as Workflow,
        });
      });
    });
  },

  saveFlowToServer: async () => {
    const data = flowSelectors.currentFlow(get());
    const workflow = yaml.dump(data, {
      indent: 2,
      replacer: (key, value) => {
        if (key === 'output') {
          return undefined;
        }
        return value;
      },
    });

    const hideLoading = message.loading('正在保存...', 0);
    try {
      await createWorkFlowDataBase({
        params: {
          id: data.id,
          workflow,
        },
      });
    } catch (error) {
      message.error('保存失败');
    } finally {
      hideLoading();
    }
  },
});
