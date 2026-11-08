-- Rate chart Cow 9.0 / Anudan (milk_rate_chartanu9) and milk_rate_proc: same names and parameters as before,
-- so the VB program and the web program both keep working. No table data is changed by this script.
--   sqlplus bgk/bgk@XE @02_rate_chart_fix.sql
-- Old versions: backup_rate_procs_before_20261106.sql
set define off

create or replace procedure milk_rate_chartanu9(SDATE IN DATE, tDATE IN DATE,
  mrate3585 in float, mdiff30 in float, mdiff29 in float, mdiff80 in float,
  mrate3579 in float, mdiff3079 in float, mdiff2979 in float, mdiff79 in float,
  mrate3685 in float, mdiff36 in float, mrate3679 in float, mdiff3679 in float,
  mdiff8582 in float, mdiff7975 in float, dairy in float) is
  -- The whole chart is saved in one transaction: a failure leaves the old rates untouched.
  mdairy    number(2) := dairy;
  next_from date;
  frate     number(10,2);

  -- rate of one fat / snf: start rate of the snf group, step down to the snf, then step along the fat
  function cell_rate(f number, s number) return number is
    r number(10,2);
    v number(4,1);
  begin
    if s >= 8.3 then
      r := case when f >= 3.6 then mrate3685 else mrate3585 end;
      v := 9.0;
      while v > s loop
        v := v - 0.1;
        r := r - case when v in (8.4, 8.3) then mdiff8582 else mdiff80 end;
      end loop;
    else
      r := case when f >= 3.6 then mrate3679 else mrate3579 end;
      v := 8.2;
      while v > s loop
        v := v - 0.1;
        r := r - case when v <= 7.9 then mdiff7975 else mdiff79 end;
      end loop;
    end if;
    if f >= 3.6 then
      v := 3.6;
      while v < f loop
        v := v + 0.1;
        r := r + case when s >= 8.3 then mdiff36 else mdiff3679 end;
      end loop;
    else
      v := 3.5;
      while v > f loop
        v := v - 0.1;
        if v >= 3.2 then r := r - case when s >= 8.3 then mdiff30 else mdiff3079 end;
        else r := r - case when s >= 8.3 then mdiff29 else mdiff2979 end;
        end if;
      end loop;
    end if;
    return r;
  end;
begin
  if sdate is null or tdate is null or tdate < sdate then
    raise_application_error(-20001, 'Invalid date: To date should not be before From date.');
  end if;
  if mdairy is null or mdairy <= 0 then
    raise_application_error(-20002, 'Select dairy.');
  end if;
  if nvl(mrate3585,0) <= 0 or nvl(mrate3579,0) <= 0 or nvl(mrate3685,0) <= 0 or nvl(mrate3679,0) <= 0 then
    raise_application_error(-20003, 'All four rates (3.5-9.0, 3.5-8.2, 3.6-9.0, 3.6-8.2) are required.');
  end if;
  if least(nvl(mdiff30,0), nvl(mdiff29,0), nvl(mdiff80,0), nvl(mdiff3079,0), nvl(mdiff2979,0), nvl(mdiff79,0),
           nvl(mdiff36,0), nvl(mdiff3679,0), nvl(mdiff8582,0), nvl(mdiff7975,0)) < 0 then
    raise_application_error(-20004, 'A difference is negative. Check the rates and differences.');
  end if;

  -- a chart may not run into the next chart of this dairy
  select min(drate_from_date) into next_from from milk_fat_snf_rate_master
   where ndairy = mdairy and cb = 1 and drate_from_date > sdate;
  if next_from is not null and tdate >= next_from then
    raise_application_error(-20005, 'Next rate chart of this dairy starts on ' || to_char(next_from, 'dd/mm/yyyy')
      || '. To date should be before that date.');
  end if;

  -- this chart again (correction): replace it
  delete from milk_fat_snf_rate_master t
   where t.drate_from_date = sdate and t.ndairy = mdairy and t.cb = 1
     and t.nfat between 2.5 and 5.5 and t.nsnf between 7.0 and 9.0;

  -- the chart before this one ends the day before (each fat / snf separately)
  update milk_fat_snf_rate_master t set t.drate_to_date = sdate - 1
   where t.ndairy = mdairy and t.cb = 1 and t.drate_from_date < sdate
     and t.nfat between 2.5 and 5.5 and t.nsnf between 7.0 and 9.0
     and t.drate_from_date = (select max(m.drate_from_date) from milk_fat_snf_rate_master m
                               where m.nfat = t.nfat and m.nsnf = t.nsnf and m.ndairy = mdairy and m.cb = 1
                                 and m.drate_from_date < sdate);

  for fi in 25 .. 55 loop
    for si in 70 .. 90 loop
      frate := cell_rate(fi / 10, si / 10);
      if frate <= 0 then
        raise_application_error(-20006, 'Rate becomes zero or negative at fat ' || to_char(fi / 10, 'fm0.0')
          || ' snf ' || to_char(si / 10, 'fm0.0') || '. Check the rates and differences.');
      end if;
      insert into milk_fat_snf_rate_master(nfat, nsnf, drate_from_date, drate_to_date, nrate, ndairy, cb, ntrans_no)
      values (fi / 10, si / 10, sdate, tdate, frate, mdairy, 1, transno.nextval);
    end loop;
  end loop;
  commit;
exception
  when others then
    rollback;
    raise;
end milk_rate_chartanu9;
/

create or replace procedure milk_rate_proc(yearcode in char, frtno in number) is
begin
  -- rate of the supplier's own dairy. Left as saved: entries with no rate in the chart, and entries already
  -- billed (a supplier moved to another dairy later must not change what was paid).
  merge into milk_input pd
  using (select i.rowid rid, r.nrate
           from milk_input i, milk_supplier s, milk_fat_snf_rate_master r
          where i.vyear_code = yearcode and i.nfortno = frtno
            and s.ncode = i.ncode and r.ndairy = s.ndairy
            and r.nfat = i.nfat and r.nsnf = i.nsnf
            and i.ddate >= r.drate_from_date and i.ddate <= r.drate_to_date
            and not exists (select 1 from milk_bill_header h
                             where h.vyear_code = i.vyear_code and h.nfortno = i.nfortno and h.ncode = i.ncode)) x
  on (pd.rowid = x.rid)
  when matched then update set pd.nrate = x.nrate where nvl(pd.nrate, -1) <> x.nrate;

  update milk_input pd
     set pd.namount = nvl(pd.nrate, 0) * nvl(pd.nltr, 0)
   where vyear_code = yearcode and nfortno = frtno
     and nvl(pd.namount, -1) <> round(nvl(pd.nrate, 0) * nvl(pd.nltr, 0), 2)
     and not exists (select 1 from milk_bill_header h
                      where h.vyear_code = pd.vyear_code and h.nfortno = pd.nfortno and h.ncode = pd.ncode);
  commit;
exception
  when others then
    rollback;
    raise;
end milk_rate_proc;
/

show errors
exit
