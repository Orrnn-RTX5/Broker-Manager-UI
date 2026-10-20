import { showResult } from '../store/resultDialogStore.js';
import { createElement, useState } from 'react';
import {
  ArrowLeftRight,
  DollarSign,
  BarChart3,
  MessageSquare,
  XCircle,
  XSquare,
  Undo2,
  CheckCircle2,
} from 'lucide-react';
import DealerPromptDialog from '../components/dealer/DealerPromptDialog';
import {
  positionFlip,
  positionPriceChange,
  positionVolumeChange,
  positionCommentChange,
  positionForceClose,
  positionForceCloseAll,
  orderPriceChange,
  orderReject,
  orderApprove,
  dealRollback,
} from '../services/tradeApi';
import { normalizeCommentForDefault } from '../utils/commentTranslation';

export const useDealerMenu = (onRefresh) => {
  const [dialog, setDialog] = useState(null);
  const [loading, setLoading] = useState(false);

  const exec = async (fn) => {
    setLoading(true);
    try {
      // NOTE (stub-vs-transport split): the real transport throws first —
      // apiClient.request() runs throwIfErrorPayload before resolving, so a
      // { success: false } payload never reaches this success path in
      // production (it lands in catch below, without refresh). showResult
      // still classifies via normalizeResult (resultDialogStore) as defense
      // in depth, which is why a unit stub resolving { success: false }
      // straight into exec() renders as an error dialog yet still refreshes
      // — stub order differs from transport order.
      const result = await fn();
      showResult(result);
      onRefresh?.();
      setDialog(null);
    } catch (err) {
      showResult.error(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getPositionActions = (pos) => {
    const ticket = pos?.position || pos?.ticket;
    const login = pos?.login;

    return [
      {
        text: 'Flip Position',
        icon: ArrowLeftRight,
        iconTone: 'warn',
        onClick: () => {
          if (window.confirm(`Flip position #${ticket}?`)) {
            exec(() => positionFlip(ticket));
          }
        },
      },
      {
        text: 'Change Price',
        icon: DollarSign,
        iconTone: 'accent',
        onClick: () => setDialog({
          title: `Change Price - #${ticket}`,
          fields: [{
            key: 'new_price',
            label: 'New Price',
            type: 'number',
            step: '0.00001',
            required: true,
            defaultValue: pos?.priceOpen || '',
          }],
          onSubmit: (values) => exec(() => positionPriceChange(ticket, values.new_price)),
        }),
      },
      {
        text: 'Change Volume',
        icon: BarChart3,
        iconTone: 'info',
        onClick: () => setDialog({
          title: `Change Volume - #${ticket}`,
          fields: [{
            key: 'new_lots',
            label: 'New Lots',
            type: 'number',
            step: '0.01',
            required: true,
            defaultValue: pos?.volume || '',
            hint: 'Only decrease is supported currently.',
          }],
          onSubmit: (values) => exec(() => positionVolumeChange(ticket, values.new_lots)),
        }),
      },
      {
        text: 'Change Comment',
        icon: MessageSquare,
        iconTone: 'ok',
        onClick: () => setDialog({
          title: `Change Comment - #${ticket}`,
          fields: [
            { key: 'comment', label: 'Comment', type: 'text', defaultValue: pos?.comment || '' },
            { key: 'magic', label: 'Magic Number', type: 'number' },
          ],
          onSubmit: (values) => exec(() => positionCommentChange({
            ticket,
            comment: values.comment !== undefined ? normalizeCommentForDefault(values.comment) : values.comment,
            magic: values.magic || undefined,
          })),
        }),
      },
      { isSep: true },
      {
        text: 'Force Close',
        icon: XCircle,
        iconTone: 'danger',
        onClick: () => setDialog({
          title: `Force Close - #${ticket}`,
          fields: [
            {
              key: 'price',
              label: 'Close Price',
              type: 'number',
              step: '0.00001',
              required: true,
              defaultValue: pos?.priceCurrent || '',
            },
            { key: 'comment', label: 'Comment', type: 'text' },
          ],
          onSubmit: (values) => exec(() => positionForceClose({
            ticket,
            price: values.price,
            comment: values.comment || undefined,
          })),
        }),
      },
      {
        text: 'Force Close All (Login)',
        icon: XSquare,
        iconTone: 'danger',
        onClick: () => setDialog({
          title: `Force Close All - Login ${login}`,
          fields: [
            { key: 'symbol', label: 'Symbol (blank = all)', type: 'text', defaultValue: pos?.symbol || '' },
            { key: 'comment', label: 'Comment', type: 'text' },
          ],
          onSubmit: (values) => {
            if (window.confirm(`Force close ALL positions for login ${login}?`)) {
              exec(() => positionForceCloseAll({
                login,
                symbol: values.symbol || undefined,
                comment: values.comment || undefined,
              }));
            }
          },
        }),
      },
    ];
  };

  const getOrderActions = (order) => {
    const ticket = order?.ticket;
    return [
      {
        text: 'Change Price',
        icon: DollarSign,
        iconTone: 'accent',
        onClick: () => setDialog({
          title: `Change Order Price - #${ticket}`,
          fields: [{
            key: 'price',
            label: 'New Price',
            type: 'number',
            step: '0.00001',
            required: true,
            defaultValue: order?.priceOpen || '',
          }],
          onSubmit: (values) => exec(() => orderPriceChange(ticket, values.price)),
        }),
      },
      { isSep: true },
      {
        text: 'Approve Order',
        icon: CheckCircle2,
        iconTone: 'ok',
        onClick: () => setDialog({
          title: `Approve Order - #${ticket}`,
          fields: [{ key: 'comment', label: 'Comment (optional)', type: 'text' }],
          onSubmit: (values) => exec(() => orderApprove({ ticket, comment: values.comment || undefined })),
        }),
      },
      {
        text: 'Reject Order',
        icon: XCircle,
        iconTone: 'danger',
        onClick: () => setDialog({
          title: `Reject Order - #${ticket}`,
          fields: [{ key: 'comment', label: 'Reason', type: 'text', required: true }],
          onSubmit: (values) => exec(() => orderReject({ ticket, comment: values.comment || undefined })),
        }),
      },
    ];
  };

  const getDealActions = (deal) => {
    const ticket = deal?.ticket || deal?.deal;
    return [
      {
        text: 'Rollback Deal',
        icon: Undo2,
        iconTone: 'danger',
        onClick: () => setDialog({
          title: `Rollback Deal - #${ticket}`,
          fields: [{ key: 'comment', label: 'Reason', type: 'text', required: true }],
          onSubmit: (values) => {
            if (window.confirm(`Rollback deal #${ticket}?`)) {
              exec(() => dealRollback({ deal: ticket, comment: values.comment || undefined }));
            }
          },
        }),
      },
    ];
  };

  const renderDialog = () => {
    if (!dialog) return null;

    return createElement(DealerPromptDialog, {
      title: dialog.title,
      fields: dialog.fields,
      onSubmit: dialog.onSubmit,
      onCancel: () => setDialog(null),
      loading,
    });
  };

  return { getPositionActions, getOrderActions, getDealActions, renderDialog };
};
