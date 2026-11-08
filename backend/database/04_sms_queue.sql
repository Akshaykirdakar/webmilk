-- SMS after a milk entry: the queue the Android app (android\) reads, the phones, and the on/off switch.
-- New tables only; safe to run again. SMS stays OFF until it is switched on in Transactions > SMS Status.
--   sqlplus bgk/bgk@XE @04_sms_queue.sql
declare
  procedure run(s varchar2) is begin execute immediate s; exception when others then if sqlcode not in (-955) then raise; end if; end;
begin
  run('create table milk_sms_queue (
         nid number(12) primary key, dcreated date default sysdate, vmobile varchar2(15), vtext varchar2(400),
         ncode number(10), ntrans_no number(12), vpref varchar2(64), vstatus char(1) default ''P'',
         vdevice varchar2(64), dclaim date, dsent date, nattempts number(2) default 0, verror varchar2(200))');
  run('create index milk_sms_q1 on milk_sms_queue (vstatus, nid)');
  run('create index milk_sms_q2 on milk_sms_queue (vdevice, dsent)');
  run('create index milk_sms_q3 on milk_sms_queue (ntrans_no, vstatus)');
  run('create table milk_sms_device (vdevice varchar2(64) primary key, vname varchar2(100), dlast_seen date)');
  run('create table milk_sms_setting (nid number(1) primary key, nenabled number(1) default 0, vtest_no varchar2(15), ndaily_limit number(6) default 100)');
  run('create sequence milk_sms_seq');
  begin execute immediate 'alter table milk_sms_setting add nasked number(1) default 0'; exception when others then if sqlcode <> -1430 then raise; end if; end;
  begin execute immediate 'insert into milk_sms_setting (nid, nenabled, ndaily_limit) values (1, 0, 100)'; commit;
  exception when dup_val_on_index then null; end;
end;
/
select table_name from user_tables where table_name like 'MILK_SMS%' order by 1;
exit
