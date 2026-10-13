import type { MouseEventHandler } from 'react';
import { adminStatusTone, type AdminStatusTone } from '@/utils/adminStatus';
import AdminIcon, { type AdminIconName } from './AdminIcon';
import './admin-status.css';

const icons: Record<AdminStatusTone, AdminIconName> = {
  danger: 'alert', warning: 'clock', info: 'info', success: 'check', neutral: 'minus',
};

type Props = {
  label: string;
  tone?: AdminStatusTone;
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

export default function AdminStatusBadge({ label, tone = adminStatusTone(label), onClick }: Props) {
  const content = <><AdminIcon name={icons[tone]} size={15} /><span>{label}</span></>;
  return onClick
    ? <button type="button" className="admin-status-badge" data-status-tone={tone} onClick={onClick}>{content}</button>
    : <span className="admin-status-badge" data-status-tone={tone}>{content}</span>;
}
