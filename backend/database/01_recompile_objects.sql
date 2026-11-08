-- Run once after importing a .pde/.dmp backup into the BGK schema (as bgk):
--   sqlplus bgk/bgk@XE @01_recompile_objects.sql
-- After an import the milk procedures/views are left INVALID; the web API calls them
-- (milk_bill_proc2, milk_bonus_proc2, milk_bill_proc_anudan, milk_rate_proc, milk_ledger_proc,
--  milk_cattel_proc, milk_shiv_proc, milk_adjust_proc, milk_rate_chart*, view milk_cattel_feed_balance).
-- No table or data is changed by this script.

begin
  dbms_utility.compile_schema(schema => user, compile_all => false);
end;
/

column object_name format a40
prompt Objects still invalid (old/unused procedures may stay invalid - that is fine):
select object_type, object_name from user_objects where status = 'INVALID' order by 1, 2;
exit
