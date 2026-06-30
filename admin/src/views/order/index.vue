<template>
  <div class="order-page">
    <div class="page-header"><h2>订单管理</h2><el-button type="danger" @click="batchDelete" :disabled="selectedRows.length===0">批量删除 ({{ selectedRows.length }})</el-button></div>
    <el-card style="margin-bottom:16px">
      <el-form :inline="true" :model="qf">
        <el-form-item label="赛事"><el-select v-model="qf.matchId" placeholder="全部" clearable filterable style="width:180px"><el-option v-for="m in matchOpts" :key="m._id" :label="m.name" :value="m._id" /></el-select></el-form-item>
        <el-form-item label="用户名"><el-input v-model="qf.username" placeholder="搜索" clearable /></el-form-item>
        <el-form-item label="状态"><el-select v-model="qf.status" placeholder="全部" clearable style="width:100px"><el-option label="待开奖" value="pending"/><el-option label="已中奖" value="won"/><el-option label="未中奖" value="lost"/><el-option label="已结算" value="settled"/></el-select></el-form-item>
        <el-form-item><el-button type="primary" icon="Search" @click="loadList">搜索</el-button></el-form-item>
      </el-form>
    </el-card>

    <el-row :gutter="16" style="margin-bottom:16px">
      <el-col :span="8"><el-card shadow="hover"><div class="stat-mini">该用户当天下单总额：<b>¥ {{ stats.dailyTotal }}</b></div></el-card></el-col>
      <el-col :span="8"><el-card shadow="hover"><div class="stat-mini">该用户中奖总额：<b>¥ {{ stats.winTotal }}</b></div></el-card></el-col>
      <el-col :span="8"><el-card shadow="hover"><div class="stat-mini">订单数：<b>{{ stats.orderCount }}</b></div></el-card></el-col>
    </el-row>

    <el-card>
      <el-table :data="list" border stripe v-loading="loading" @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="45" />
        <el-table-column prop="orderNo" label="单号" width="180" />
        <el-table-column prop="username" label="用户" width="100" />
        <el-table-column label="赛事" width="140"><template #default="{row}">{{ row.matchName }}</template></el-table-column>
        <el-table-column label="玩法明细" min-width="180">
          <template #default="{row}"><span v-for="it in (row.items||[])" :key="it._id" style="margin-right:8px">{{ it.playName }}@{{ it.oddsSnapshot }}</span></template>
        </el-table-column>
        <el-table-column label="串关" width="60"><template #default="{row}">{{ row.isParlay?'是':'否' }}</template></el-table-column>
        <el-table-column prop="betAmount" label="下注额" width="100" />
        <el-table-column label="总赔率" width="80"><template #default="{row}">{{ row.totalOdds?.toFixed(2) }}</template></el-table-column>
        <el-table-column prop="winAmount" label="中奖金额" width="100" />
        <el-table-column label="状态" width="90"><template #default="{row}"><el-tag :type="{pending:'warning',won:'success',lost:'info',settled:'info'}[row.status]">{{ {pending:'待开奖',won:'已中奖',lost:'未中奖',settled:'已结算'}[row.status] }}</el-tag></template></el-table-column>
        <el-table-column label="下单时间" width="160"><template #default="{row}">{{ fmt(row.createTime) }}</template></el-table-column>
        <el-table-column label="操作" width="80">
          <template #default="{row}"><el-popconfirm title="确定删除该订单？" @confirm="doDelete(row)"><template #reference><el-button size="small" type="danger">删除</el-button></template></el-popconfirm></template>
        </el-table-column>
      </el-table>
      <el-pagination v-model:current-page="page" v-model:page-size="ps" :total="total" layout="total,prev,pager,next" style="margin-top:16px;justify-content:flex-end" @change="loadList" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getOrderList, getOrderStats, getMatchList, deleteOrder, batchDeleteOrders } from '@/api'

const loading=ref(false),list=ref([]),page=ref(1),ps=ref(20),total=ref(0),selectedRows=ref([])
const qf=reactive({matchId:'',username:'',status:''})
const stats=reactive({dailyTotal:'0.00',winTotal:'0.00',orderCount:0})
const matchOpts=ref([])

const loadList=async()=>{loading.value=true;try{const res=await getOrderList({...qf,page:page.value,pageSize:ps.value});list.value=res.data.list||[];total.value=res.data.total||0;refreshStats()}catch(e){console.error(e)}loading.value=false}
const refreshStats=async()=>{try{const res=await getOrderStats({matchId:qf.matchId,username:qf.username});Object.assign(stats,{dailyTotal:(res.data.dailyUserTotal||0).toFixed(2),winTotal:(res.data.userMatchWinTotal||0).toFixed(2),orderCount:res.data.orderCount})}catch(e){}}
onMounted(async()=>{const m=await getMatchList({pageSize:500});matchOpts.value=m.data.list||[];loadList()})
const fmt=(t)=>t?new Date(t).toLocaleString('zh-CN'):''
const handleSelectionChange=(rows)=>{selectedRows.value=rows}
const doDelete=async(row)=>{try{await deleteOrder(row._id);ElMessage.success('已删除');loadList()}catch(e){ElMessage.error(e.message||'删除失败')}}
const batchDelete=async()=>{
  if(selectedRows.value.length===0)return
  try{
    await ElMessageBox.confirm(`确定删除选中的 ${selectedRows.value.length} 条订单？`,'批量删除',{type:'warning'})
    const ids=selectedRows.value.map(r=>r._id)
    await batchDeleteOrders(ids)
    ElMessage.success(`已删除 ${ids.length} 条订单`)
    selectedRows.value=[]
    loadList()
  }catch(e){if(e!=='cancel')ElMessage.error(e.message||'删除失败')}
}
</script>

<style lang="scss" scoped>
.stat-mini{font-size:15px;b{font-size:20px;color:#409EFF}}
.order-page .page-header h2{margin:0 0 16px 0}
</style>
