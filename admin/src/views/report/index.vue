<template>
  <div class="report-page">
    <h2>报表统计</h2>
    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="每日总流水" name="daily">
        <el-card style="margin-bottom:16px"><el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始" end-placeholder="结束" /> <el-button type="primary" style="margin-left:12px" @click="loadDaily">查询</el-button></el-card>
        <el-card>
          <el-table :data="dailyData" border stripe>
            <el-table-column prop="date" label="日期" width="140" />
            <el-table-column prop="totalBet" label="下注总额" /><el-table-column prop="orderCount" label="订单数" /><el-table-column prop="winAmount" label="中奖总额" />
          </el-table>
        </el-card>
      </el-tab-pane>
      <el-tab-pane label="按赛事统计" name="match">
        <el-card>
          <el-table :data="matchData" border stripe v-loading="loading">
            <el-table-column prop="matchName" label="赛事" /><el-table-column prop="teamA" label="主队" /><el-table-column prop="teamB" label="客队" />
            <el-table-column prop="totalBet" label="下注总额" /><el-table-column prop="totalWin" label="中奖总额" />
            <el-table-column label="盈亏"><template #default="{row}"><span :style="{color:row.profit>=0?'green':'red'}">{{ (row.profit||0).toFixed(2) }}</span></template></el-table-column>
            <el-table-column prop="orderCount" label="订单数" />
          </el-table>
        </el-card>
      </el-tab-pane>
      <el-tab-pane label="盈亏报表" name="profit">
        <el-card v-loading="loading">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="总下注额">{{ profitData.totalBet?.toFixed(2) }}</el-descriptions-item>
            <el-descriptions-item label="总中奖额">{{ profitData.totalWin?.toFixed(2) }}</el-descriptions-item>
            <el-descriptions-item label="总订单数">{{ profitData.orderCount }}</el-descriptions-item>
            <el-descriptions-item label="已中奖订单">{{ profitData.wonCount }}</el-descriptions-item>
            <el-descriptions-item label="未中奖订单">{{ profitData.lostCount }}</el-descriptions-item>
            <el-descriptions-item label="毛利润"><b :style="{color:(profitData.grossProfit||0)>=0?'green':'red'}">{{ profitData.grossProfit?.toFixed(2) }}</b></el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { getDailyReport, getMatchReport, getProfitReport } from '@/api'

const activeTab=ref('daily'),loading=ref(false)
const dateRange=ref([]),dailyData=ref([]),matchData=ref([]),profitData=ref({})

const loadDaily=async()=>{loading.value=true;try{const res=await getDailyReport({startDate:dateRange.value?.[0],endDate:dateRange.value?.[1]});dailyData.value=res.data.daily||[]}catch(e){console.error(e)}loading.value=false}
const loadMatch=async()=>{loading.value=true;try{const res=await getMatchReport();matchData.value=res.data.matchStats||[]}catch(e){console.error(e)}loading.value=false}
const loadProfit=async()=>{loading.value=true;try{const res=await getProfitReport();profitData.value=res.data}catch(e){console.error(e)}loading.value=false}

const handleTabChange=(tab)=>{if(tab==='daily')loadDaily();if(tab==='match')loadMatch();if(tab==='profit')loadProfit()}
</script>

<style lang="scss" scoped>
.report-page h2 { margin-bottom: 16px; }
</style>
