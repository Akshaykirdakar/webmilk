-- Old versions of the rate procedures, saved 06-11-2026 before 02_rate_chart_fix.sql. Run this file to go back.
create or replace
procedure milk_rate_chartanu9(SDATE IN DATE ,tDATE IN DATE,
mrate3585 in float,
mdiff30 in float,
mdiff29 in float,
mdiff80 in float,
mrate3579 in float,
mdiff3079 in float,
mdiff2979 in float,
mdiff79 in float,
mrate3685 in float,
mdiff36 in float,
mrate3679 in float,
mdiff3679 in float ,
mdiff8582 in float,
mdiff7975 in float, dairy in float) is
begin
  declare
  i number(10,1);
  j number(10,1);
  rate number(10,2);
  brate number(10,2);
  mtrans_no number(12);
   mdairy number(2);
  begin
    i:=2.5;
 mdairy := dairy;
    while  i<=5.5
     loop
     j:=7.0;
     while  j <=9.0
     loop
     delete from MILK_FAT_SNF_RATE_MASTER t where t.drate_from_date=sdate and t.nfat=i and t.nsnf=j and t.ndairy = mdairy;
     commit;
     insert into MILK_FAT_SNF_RATE_MASTER(nfat,nsnf,drate_from_date,ndairy,cb)
     values(i,j,SDATE,mdairy,1);
     commit;
     j:=j+0.1;
     end loop;
     i:=i+0.1;
     end loop;
     update MILK_FAT_SNF_RATE_MASTER t set t.ntrans_no = transno.nextval
            where t.drate_from_date=sdate  and t.ndairy = mdairy and t.cb=1;
            commit;
      -- update rate
      i:=9.0;

      rate := mrate3585;
      brate := mrate3585;
    while  i >= 8.0
     loop
     j:=3.5;
     while  j >=2.5
     loop
     update MILK_FAT_SNF_RATE_MASTER t set t.drate_to_date = sdate - 1   where t.nfat= j and t.nsnf = i and t.ndairy = mdairy and t.cb=1 and
    t.drate_to_date = ( select max (m.drate_to_date) from MILK_FAT_SNF_RATE_MASTER m where m.nfat= j and m.nsnf= i and m.ndairy = mdairy and m.cb=1);
    commit;
       update MILK_FAT_SNF_RATE_MASTER t set t.drate_to_date = tdate
     where t.drate_from_date=sdate and t.nfat= j and t.nsnf= i and t.ndairy = mdairy and t.cb=1;
     commit;

     update MILK_FAT_SNF_RATE_MASTER t set t.nrate = rate
     where t.drate_from_date=sdate and t.nfat= j and t.nsnf= i and t.ndairy = mdairy and t.cb=1;
     commit;
           j:=j - 0.1;
           if j >=3.2  then
              rate := rate - mdiff30;
              else
              rate := rate - mdiff29;
              end if;
     end loop;
     i:=i - 0.1;
     if i in (8.4,8.3) then
      brate := brate - mdiff8582;
      rate := brate;
     else
     brate := brate - mdiff80;
     rate := brate;
     end if;
     end loop;

     --  snf 7.9 to 7.5 and fat 3.5 to 2.5
     i:=8.2;
     rate := mrate3579;
     brate := rate;
     while  i >= 7.0
     loop
     j:=3.5;
     while  j >=2.5
     loop
       update MILK_FAT_SNF_RATE_MASTER t set t.drate_to_date = sdate - 1   where t.nfat= j and t.nsnf= i and t.ndairy= mdairy and t.cb=1 and
    t.drate_to_date = ( select max (m.drate_to_date) from MILK_FAT_SNF_RATE_MASTER m where m.nfat= j and m.nsnf= i and m.ndairy = mdairy and m.cb=1);
    commit;
     update MILK_FAT_SNF_RATE_MASTER t set t.drate_to_date = tdate
     where t.drate_from_date=sdate and t.nfat= j and t.nsnf= i and t.ndairy = mdairy and t.cb=1;
     commit;
     update MILK_FAT_SNF_RATE_MASTER t set t.nrate = rate
     where t.drate_from_date=sdate and t.nfat= j and t.nsnf= i and t.ndairy = mdairy and t.cb=1;
     commit;
           j:=j - 0.1;
           if j >=3.2 then
              rate := rate - mdiff3079;
              else
              rate := rate - mdiff2979;
              end if;
     end loop;
     i:=i - 0.1;
     if i <= 7.9 then
     brate := brate - mdiff7975;
     rate := brate;
     else
     brate := brate - mdiff79;
     rate := brate;
     end if;
     end loop;

     ----
   -- 3.6 to 5.5  and snf 8.5 to 8.0
     i:=9.0;
      rate := mrate3685 ;
       brate := mrate3685;
    while  i >= 8.2
     loop
           j:=3.6;
           while  j <=5.5
           loop
            update MILK_FAT_SNF_RATE_MASTER t set t.drate_to_date = sdate - 1   where t.nfat= j and t.nsnf= i and t.ndairy = mdairy and t.cb=1 and
    t.drate_to_date = ( select max (m.drate_to_date) from MILK_FAT_SNF_RATE_MASTER m where m.nfat= j and m.nsnf= i and m.ndairy = mdairy and m.cb=1);
    commit;
     update MILK_FAT_SNF_RATE_MASTER t set t.drate_to_date = tdate
     where t.drate_from_date=sdate and t.nfat= j and t.nsnf= i and t.ndairy = mdairy and t.cb=1;
     commit;
            update MILK_FAT_SNF_RATE_MASTER t set t.nrate = rate
            where t.drate_from_date=sdate and t.nfat= j and t.nsnf= i and t.ndairy = mdairy and t.cb=1;
            commit;
                  j:=j + 0.1;
                  rate := rate + mdiff36;
            end loop;
       i:=i - 0.1;
       if i in (8.4,8.3) then
           brate := brate - mdiff8582;
          rate := brate;
      else
       brate := brate - mdiff80;
       rate := brate;
       end if;
     end loop;
      -- 3.6 to 5.5  and snf 7.9 to 7.5
     i:=8.2;
      rate := mrate3679 ;
       brate := mrate3679;
    while  i >= 7.0
     loop
           j:=3.6;
           while  j <=5.5
           loop
            update MILK_FAT_SNF_RATE_MASTER t set t.drate_to_date = sdate - 1   where t.nfat= j and t.nsnf= i and t.ndairy = mdairy and t.cb=1 and
    t.drate_to_date = ( select max (m.drate_to_date) from MILK_FAT_SNF_RATE_MASTER m where m.nfat= j and m.nsnf= i and m.ndairy = mdairy and m.cb=1);
    commit;
     update MILK_FAT_SNF_RATE_MASTER t set t.drate_to_date = tdate
     where t.drate_from_date=sdate and t.nfat= j and t.nsnf= i and t.ndairy = mdairy and t.cb=1;
     commit;
            update MILK_FAT_SNF_RATE_MASTER t set t.nrate = rate
            where t.drate_from_date=sdate and t.nfat= j and t.nsnf= i and t.ndairy = mdairy and t.cb=1;
            commit;
                  j:=j + 0.1;
                  rate := rate + mdiff3679;
            end loop;
       i:=i - 0.1;
       if i <= 7.9 then
     brate := brate - mdiff7975;
     rate := brate;
     else
       brate := brate - mdiff79;
       rate := brate;
       end if;
     end loop;
     -- update rate end

    end;
  end milk_rate_chartanu9;

/
create or replace
procedure     milk_rate_proc(yearcode in char,frtno in number) is
begin

 update milk_input pd
            set pd.nrate = (select r.nrate
                                from milk_fat_snf_rate_master r
                               where pd.ddate >= r.drate_from_date
                               and pd.ddate <=r.drate_to_date
                                    and r.nfat=pd.nfat
                                 and r.nsnf=pd.nsnf
                                 )
          where vyear_code = yearcode
       and nfortno = frtno
              ;
    commit;




       update milk_input pd
       set pd.namount = (nvl(pd.nrate, 0) *
                                  nvl(pd.nltr, 0))
     where vyear_code = yearcode
       and nfortno = frtno;

    commit;

end milk_rate_proc;

/
