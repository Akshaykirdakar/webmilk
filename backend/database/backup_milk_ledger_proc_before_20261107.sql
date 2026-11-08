-- Old milk_ledger_proc, saved before 03_ledger_same_calc.sql. Run with NLS_LANG=AMERICAN_AMERICA.AL32UTF8 to go back.
create or replace
procedure     milk_ledger_proc(FromDate in date,ToDate in date,Ledger in number,SubLedger in number) as
begin
declare
finStartDate date;
CondString varchar2(100);
FromLedger1 number;
ToLedger1 number;
begin

finStartDate:=to_date('01-Apr-' || to_char(todate,'yyyy'));
delete from milk_ledger;
delete from milk_ledger_op
commit;
if nvl(SubLedger,0) = 0 then

insert into milk_ledger(ndeduction_code,ncode,namount)
select h.ndeduction_code,h.ncode,sum(h.ndeduction_amount) from milk_bill_ded_detail h
where h.ddate<=FromDate and h.ndeduction_code=Ledger and nvl(h.ndeduction_amount,0) > 0
group by ndeduction_code,ncode;
commit;
insert into milk_ledger(ndeduction_code,ncode,namount,nbag)
select d.nded_code,d.ncode,sum(d.ndedamt)*-1,sum(nbag) from milk_deduction_2 d
where d.ddate<=FromDate and d.nded_code=Ledger and nvl(d.ndedamt,0) > 0 group by nded_code,ncode;
commit;
/*insert into milk_ledger(ndeduction_code,ncode,namount)
select d.nded_code,d.ncode,sum(d.ndedamt) from milk_deduction_2 d
where d.ddate<FromDate and d.nded_code=Ledger and nvl(d.ndedamt,0) < 0 group by nded_code,ncode;
commit;*/

insert into milk_ledger_op(ndeduction_code,ncode,namount,ddate,vnar,nbag)
select ndeduction_code,ncode,sum(namount),FromDate,'†¸Óü×³Ö“Öß ×¿Ö»»ÖÛú ',sum(nbag) from milk_ledger
where ndeduction_code=Ledger
group by ndeduction_code,ncode;
commit;
insert into milk_ledger(ndeduction_code,ncode,namount)
select d.nded_code,d.ncode,sum(d.ndedamt) from milk_deduction_jama  d
where d.ddate<=FromDate and d.nded_code=Ledger and nvl(d.ndedamt,0) > 0 group by nded_code,ncode;
commit;
insert into milk_ledger_op(ndeduction_code,ncode,namount,ddate,vnar,nbag)
select h.ndeduction_code,h.ncode,h.ndeduction_amount,h.ddate,'×¤ü. '||to_char(f.dstart_date)||' ŸÖê  '||to_char(f.dend_date)||' ¤ãü¬Ö ×²Ö»ÖÖŸÖã®Ö •Ö´ÖÖ',0 from milk_bill_ded_detail h,milk_fortnight f
where h.ddate>fromdate
and h.ddate<=todate
and h.vyear_code=f.vyear_code
and h.nfortno=f.nfortno
and nvl(h.ndeduction_amount,0) > 0
and h.ndeduction_code=Ledger;
commit;

insert into milk_ledger_op(ndeduction_code,ncode,namount,ddate,vnar,nbag)
select d.nded_code,d.ncode,(d.ndedamt)*-1,d.ddate,'¯Öë›ü ÜÖ¸êü¤üß ¯ÖÖ¾ÖŸÖß ®ÖÓ. '||trim(d.vnar)|| '  '||i.vprod_name as vnar,d.nbag
from milk_deduction_2 d, milk_supplier s , milk_item_master i
where d.ddate>fromdate
and d.ddate<=todate
and nvl(d.ndedamt,0) > 0
and Ledger=d.nded_code
and d.nded_code=1
and d.ncode=s.ncode and d.nprod_code=i.nprod_code;
commit;
insert into milk_ledger_op(ndeduction_code,ncode,namount,ddate,vnar)
select d.nded_code,d.ncode,(d.ndedamt),d.ddate,trim(d.vnar)
from milk_deduction_jama  d, milk_supplier s
where d.ddate>fromdate
and d.ddate<=todate and nvl(d.ndedamt,0) > 0
and nded_code=Ledger
and d.ncode=s.ncode ;

insert into milk_ledger_op(ndeduction_code,ncode,namount,ddate,vnar,nbag)
select d.nded_code,d.ncode,(d.ndedamt)*-1,d.ddate,trim(d.vnar) as vnar,null
from milk_deduction_2 d, milk_supplier s
where d.ddate>fromdate
and d.ddate<=todate
and nvl(d.ndedamt,0) > 0
and Ledger=d.nded_code
and d.nded_code  not in(1)
and d.ncode=s.ncode ;
commit;
else
insert into milk_ledger(ndeduction_code,ncode,namount)
select h.ndeduction_code,h.ncode,sum(h.ndeduction_amount) from milk_bill_ded_detail h
where h.ddate<FromDate and h.ndeduction_code=Ledger and nvl(h.ndeduction_amount,0) > 0 and h.ncode = SubLedger
group by ndeduction_code,ncode;
commit;
insert into milk_ledger(ndeduction_code,ncode,namount)
select d.nded_code,d.ncode,sum(d.ndedamt) from milk_deduction_jama d
where d.ddate<FromDate and d.nded_code=Ledger and nvl(d.ndedamt,0) > 0 and  d.ncode = SubLedger group by nded_code,ncode;
commit;
insert into milk_ledger(ndeduction_code,ncode,namount,nbag)
select d.nded_code,d.ncode,sum(d.ndedamt)*-1,sum(nbag) from milk_deduction_2 d
where d.ddate<FromDate and d.nded_code=Ledger and nvl(d.ndedamt,0) > 0 and  d.ncode = SubLedger group by nded_code,ncode;
commit;
/*insert into milk_ledger(ndeduction_code,ncode,namount)
select d.nded_code,d.ncode,sum(d.ndedamt) from milk_deduction_2 d
where d.ddate<FromDate and d.nded_code=Ledger and nvl(d.ndedamt,0) < 0 group by nded_code,ncode;
commit;*/

insert into milk_ledger_op(ndeduction_code,ncode,namount,ddate,vnar,nbag)
select ndeduction_code,ncode,sum(namount),FromDate,'†¸Óü×³Ö“Öß ×¿Ö»»ÖÛú ',sum(nbag) from milk_ledger
where ndeduction_code=Ledger and  ncode = SubLedger
group by ndeduction_code,ncode;
commit;
insert into milk_ledger_op(ndeduction_code,ncode,namount,ddate,vnar,nbag)
select h.ndeduction_code,h.ncode,h.ndeduction_amount,h.ddate,'×¤ü. '||to_char(f.dstart_date)||' ŸÖê  '||to_char(f.dend_date)||' ¤ãü¬Ö ×²Ö»ÖÖŸÖã®Ö •Ö´ÖÖ',0 from milk_bill_ded_detail h,milk_fortnight f
where h.ddate>=fromdate
and h.ddate<=todate
and h.vyear_code=f.vyear_code
and h.nfortno=f.nfortno
and nvl(h.ndeduction_amount,0) > 0
and h.ndeduction_code=Ledger
and h.ncode = SubLedger;
commit;
insert into milk_ledger_op(ndeduction_code,ncode,namount,ddate,vnar)
select d.nded_code,d.ncode,(d.ndedamt),d.ddate,trim(d.vnar)
from milk_deduction_jama d, milk_supplier s
where d.ddate>=fromdate
and d.ddate<=todate
and nvl(d.ndedamt,0) > 0
and nded_code=Ledger
and d.ncode = SubLedger
and d.ncode=s.ncode ;
insert into milk_ledger_op(ndeduction_code,ncode,namount,ddate,vnar,nbag)
select d.nded_code,d.ncode,(d.ndedamt)*-1,d.ddate,'¯Öë›ü ÜÖ¸êü¤üß ¯ÖÖ¾ÖŸÖß ®ÖÓ. '||trim(d.vnar)|| '  '||i.vprod_name as vnar,d.nbag
from milk_deduction_2 d, milk_supplier s , milk_item_master i
where d.ddate>=fromdate
and d.ddate<=todate
and nvl(d.ndedamt,0) > 0
and Ledger=d.nded_code
and d.nded_code=1
and d.ncode = SubLedger
and d.ncode=s.ncode and d.nprod_code=i.nprod_code;
commit;
insert into milk_ledger_op(ndeduction_code,ncode,namount,ddate,vnar,nbag)
select d.nded_code,d.ncode,(d.ndedamt)*-1,d.ddate,trim(d.vnar) as vnar,null
from milk_deduction_2 d, milk_supplier s
where d.ddate>=fromdate
and d.ddate<=todate
and nvl(d.ndedamt,0) > 0
and Ledger=d.nded_code
and d.nded_code not in(1)
and d.ncode = SubLedger
and d.ncode=s.ncode ;
commit;
end if;
end;
end milk_ledger_proc;

/
