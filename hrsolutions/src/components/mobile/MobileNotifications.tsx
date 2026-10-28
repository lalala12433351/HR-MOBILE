'use client';
import React from 'react';
import { NotificationItem } from '@/types';
import { MobileRow, MobileSection } from './MobilePrimitives';
const groupLabel=(timestamp:string)=>{const date=new Date(timestamp);if(Number.isNaN(date.getTime()))return 'Earlier';const today=new Date();today.setHours(0,0,0,0);const yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);return date>=today?'Today':date>=yesterday?'Yesterday':'Earlier';};
const timeLabel=(timestamp:string)=>{const date=new Date(timestamp);if(Number.isNaN(date.getTime()))return timestamp;const minutes=Math.max(0,Math.floor((Date.now()-date.getTime())/60000));return minutes<1?'Just now':minutes<60?`${minutes} min ago`:minutes<1440?`${Math.floor(minutes/60)} hours ago`:date.toLocaleDateString('en-GB',{day:'numeric',month:'short'});};
export function MobileNotifications({items,unread,tab,onTab,onOpen,onMarkAll,onClear,onSettings,saving}:{items:NotificationItem[];unread:number;tab:string;onTab:(tab:'all'|'unread')=>void;onOpen:(item:NotificationItem)=>void;onMarkAll:()=>void;onClear:()=>void;onSettings:()=>void;saving:boolean;}){
 return <div className="m2-page m2-notifications"><div className="m2-text-tabs" role="tablist" aria-label="Notification filters">{(['all','unread'] as const).map(key=><button key={key} type="button" role="tab" aria-selected={tab===key} onClick={()=>onTab(key)}>{key==='all'?'All':`Unread ${unread}`}</button>)}</div>
 {['Today','Yesterday','Earlier'].map(group=>{const rows=items.filter(item=>groupLabel(item.timestamp)===group);return rows.length?<MobileSection key={group} title={group}>{rows.map(item=><MobileRow key={item.id} title={item.title} detail={[item.message,timeLabel(item.timestamp)].filter(Boolean).join(' · ')} onClick={()=>onOpen(item)}/>)}</MobileSection>:null;})}
 {!items.length&&<p className="m2-empty">{tab==='unread'?'You’re all caught up. No unread notifications.':'No notifications yet.'}</p>}
 <details className="m2-secondary-options"><summary>Notification options</summary><button type="button" disabled={saving||!unread} onClick={onMarkAll}>Mark all read</button><button type="button" disabled={saving||!items.length} onClick={onClear}>Clear all notifications</button><button type="button" onClick={onSettings}>Notification settings</button></details>
 </div>;
}
